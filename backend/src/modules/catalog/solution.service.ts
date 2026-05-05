import { Types } from "mongoose";
import { Solution } from "./solution.model";
import { SolutionVersion } from "./solution-version.model";
import { InstallmentPlan } from "./installment-plan.model";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";

type CreateSolutionInput = { name: string; description?: string };

type CreateVersionInput = {
  validFrom: Date;
  validTo?: Date | null;
  basePriceCents: number;
  minPriceCents?: number | null;
  maxPriceCents?: number | null;
  currency?: string;
  agentBp: number;
  managerBp: number;
  changeReason?: string;
  active?: boolean;
  boundToUserIds?: string[];
  boundToTerritoryIds?: string[];
  boundToCustomerIds?: string[];
};

// Per Review 1.2 (2026-05-04): a single row of the pricing matrix.
export type PricingMatrixRow = {
  label?: string;
  paymentMethod: "ONE_TIME" | "ADVANCE_INSTALLMENTS" | "FULL_INSTALLMENTS";
  installmentPlanId?: string | null;
  advanceMinCents?: number | null;
  advanceMaxCents?: number | null;
  finalPriceCents?: number | null;
  finalPricePct?: number | null;
  agentBp?: number | null;
  agentPct?: number | null;
  managerBp?: number | null;
  managerPct?: number | null;
};

type UpdateVersionInput = {
  active?: boolean;
  minPriceCents?: number | null;
  maxPriceCents?: number | null;
  boundToUserIds?: string[];
  boundToTerritoryIds?: string[];
  boundToCustomerIds?: string[];
  // Per Review 1.2 (2026-05-04): admins edit the pricing matrix inline.
  pricingMatrix?: PricingMatrixRow[];
};

export async function listSolutions(opts: { includeArchived?: boolean } = {}) {
  const q: Record<string, unknown> = {};
  if (!opts.includeArchived) q.deletedAt = null;
  return Solution.find(q).sort({ name: 1 });
}

/**
 * Per Review 1.1 §3: enriched list — for each solution, includes the latest
 * active version's commission rates and the installment plans linked to it.
 * Used by the Solutions admin page to surface "what does the agent see".
 */
export async function listSolutionsEnriched(opts: { includeArchived?: boolean } = {}) {
  const solutions = await listSolutions(opts);
  if (solutions.length === 0) return [];

  const solutionIds = solutions.map((s) => s._id);
  const now = new Date();

  // Latest active version per solution (validFrom <= now, validTo > now or null)
  const versions = await SolutionVersion.find({
    solutionId: { $in: solutionIds },
    active: true,
    validFrom: { $lte: now },
    $or: [{ validTo: null }, { validTo: { $gt: now } }],
  })
    .sort({ validFrom: -1 })
    .lean();
  const versionByContext = new Map<string, (typeof versions)[number]>();
  for (const v of versions) {
    const k = v.solutionId.toString();
    if (!versionByContext.has(k)) versionByContext.set(k, v);
  }

  // Linked installment plans: either solutionIds includes this solution OR empty (all).
  const plans = await InstallmentPlan.find({
    deletedAt: null,
    active: true,
    $or: [
      { solutionIds: { $size: 0 } },
      { solutionIds: { $in: solutionIds } },
    ],
  }).lean();

  return solutions.map((s) => {
    const v = versionByContext.get(s._id.toString());
    const linkedPlans = plans.filter(
      (p) =>
        !p.solutionIds ||
        p.solutionIds.length === 0 ||
        p.solutionIds.some((pid) => pid.toString() === s._id.toString())
    );
    return {
      ...s.toObject(),
      activeVersion: v
        ? {
            _id: v._id.toString(),
            basePriceCents: v.basePriceCents,
            currency: v.currency,
            agentBp: v.agentBp,
            managerBp: v.managerBp,
            changeReason: v.changeReason,
          }
        : null,
      installmentPlans: linkedPlans.map((p) => ({
        _id: p._id.toString(),
        name: p.name,
        months: p.months,
      })),
    };
  });
}

/**
 * Per Review 1.2 (2026-05-04): per-solution dashboard. Aggregates the
 * contracts that target any version of this solution into a summary
 * (status counts + totals) plus the most recent contracts for the
 * "database" panel. Scope filtering is left to the caller — admins see all,
 * agents see only their own.
 */
export async function dashboard(solutionId: string, opts: { agentIds?: string[] } = {}) {
  await getSolution(solutionId);
  const versionIds = await SolutionVersion.find({ solutionId }, { _id: 1 }).lean();
  if (versionIds.length === 0) {
    return { summary: [], recent: [], totals: { count: 0, amountCents: 0 } };
  }
  const { Contract } = await import("../contracts/contract.model");
  const versionObjectIds = versionIds.map((v) => v._id);
  const baseMatch: Record<string, unknown> = {
    solutionVersionId: { $in: versionObjectIds },
  };
  if (opts.agentIds) {
    baseMatch.agentId = { $in: opts.agentIds };
  }
  const summary = await Contract.aggregate<{
    _id: string;
    count: number;
    amountCents: number;
  }>([
    { $match: baseMatch },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        amountCents: { $sum: "$amountCents" },
      },
    },
  ]);
  const totals = summary.reduce(
    (acc, s) => ({
      count: acc.count + s.count,
      amountCents: acc.amountCents + s.amountCents,
    }),
    { count: 0, amountCents: 0 }
  );
  const recent = await Contract.find(baseMatch)
    .sort({ createdAt: -1 })
    .limit(20)
    .select(
      "_id customerId agentId status amountCents currency paymentMethod signedAt createdAt"
    )
    .lean();
  return { summary, totals, recent };
}

export async function setActive(id: string, active: boolean) {
  const s = await Solution.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { active },
    { new: true }
  );
  if (!s) throw new HttpError(404, "Solution not found");
  return s;
}

export async function archive(id: string) {
  const s = await Solution.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), active: false },
    { new: true }
  );
  if (!s) throw new HttpError(404, "Solution not found");
  return s;
}

export async function unarchive(id: string) {
  const s = await Solution.findOneAndUpdate(
    { _id: id },
    { deletedAt: null, active: true },
    { new: true }
  );
  if (!s) throw new HttpError(404, "Solution not found");
  return s;
}

export async function getSolution(id: string) {
  const s = await Solution.findOne({ _id: id, deletedAt: null });
  if (!s) throw new HttpError(404, "Solution not found");
  return s;
}

export async function createSolution(input: CreateSolutionInput) {
  const exists = await Solution.findOne({ name: input.name });
  if (exists) throw new HttpError(409, "Solution name already exists");
  return Solution.create(input);
}

export async function listVersions(solutionId: string) {
  await getSolution(solutionId);
  return SolutionVersion.find({ solutionId }).sort({ validFrom: -1 });
}

export async function getVersion(versionId: string) {
  const v = await SolutionVersion.findById(versionId);
  if (!v) throw new HttpError(404, "Solution version not found");
  return v;
}

/**
 * Active version at a given moment.
 * `ctx` filters bindings: if a version is bound to specific users/territories/customers,
 * it's only returned when ctx contains a matching id. Versions with empty bindings
 * are unrestricted (modulo `active`).
 */
export async function activeVersionAt(
  solutionId: string,
  at: Date,
  ctx: { userId?: string; territoryId?: string; customerId?: string } = {}
) {
  const candidates = await SolutionVersion.find({
    solutionId,
    active: true,
    validFrom: { $lte: at },
    $or: [{ validTo: null }, { validTo: { $gt: at } }],
  })
    .sort({ validFrom: -1 })
    .lean();

  const matchesBinding = (
    bound: unknown[],
    contextId: string | undefined
  ): boolean => {
    if (!bound || bound.length === 0) return true;
    if (!contextId) return false;
    return bound.some((b) => b?.toString() === contextId);
  };

  const eligible = candidates.find(
    (v) =>
      matchesBinding(v.boundToUserIds as unknown[], ctx.userId) &&
      matchesBinding(v.boundToTerritoryIds as unknown[], ctx.territoryId) &&
      matchesBinding(v.boundToCustomerIds as unknown[], ctx.customerId)
  );
  if (!eligible) throw new HttpError(404, "No active version for that date and context");
  return eligible;
}

export async function createVersion(
  solutionId: string,
  createdBy: string,
  input: CreateVersionInput
) {
  await getSolution(solutionId);

  if (
    input.minPriceCents !== null &&
    input.minPriceCents !== undefined &&
    input.maxPriceCents !== null &&
    input.maxPriceCents !== undefined &&
    input.minPriceCents > input.maxPriceCents
  ) {
    throw new HttpError(400, "minPriceCents must be <= maxPriceCents");
  }

  // Per Review 1.3 (2026-05-04): the base price MUST sit inside the price
  // range when a range is configured — otherwise the matrix gets contradicted
  // (e.g. base €10k but range capped at €8k means every contract is "out of
  // range" by definition).
  if (
    input.minPriceCents !== null &&
    input.minPriceCents !== undefined &&
    input.basePriceCents < input.minPriceCents
  ) {
    throw new HttpError(
      400,
      `basePriceCents (${input.basePriceCents}) must be ≥ minPriceCents (${input.minPriceCents})`
    );
  }
  if (
    input.maxPriceCents !== null &&
    input.maxPriceCents !== undefined &&
    input.basePriceCents > input.maxPriceCents
  ) {
    throw new HttpError(
      400,
      `basePriceCents (${input.basePriceCents}) must be ≤ maxPriceCents (${input.maxPriceCents})`
    );
  }

  const previous = await SolutionVersion.findOne({ solutionId, validTo: null }).sort({
    validFrom: -1,
  });
  if (previous && previous.validFrom >= input.validFrom) {
    throw new HttpError(400, "validFrom must be after the previous version's validFrom");
  }

  const version = await SolutionVersion.create({
    solutionId,
    validFrom: input.validFrom,
    validTo: input.validTo ?? null,
    basePriceCents: input.basePriceCents,
    minPriceCents: input.minPriceCents ?? null,
    maxPriceCents: input.maxPriceCents ?? null,
    currency: input.currency ?? "EUR",
    agentBp: input.agentBp,
    managerBp: input.managerBp,
    changeReason: input.changeReason ?? "",
    createdBy,
    active: input.active ?? true,
    boundToUserIds:
      input.boundToUserIds?.map((id) => new Types.ObjectId(id)) ?? [],
    boundToTerritoryIds:
      input.boundToTerritoryIds?.map((id) => new Types.ObjectId(id)) ?? [],
    boundToCustomerIds:
      input.boundToCustomerIds?.map((id) => new Types.ObjectId(id)) ?? [],
  });

  if (previous && !previous.validTo) {
    previous.validTo = input.validFrom;
    await previous.save();
  }

  events.emit("solution.version.updated", {
    solutionId,
    versionId: version._id.toString(),
  });

  return version;
}

export async function updateVersion(versionId: string, input: UpdateVersionInput) {
  const updates: Record<string, unknown> = {};
  if (input.active !== undefined) updates.active = input.active;
  if (input.minPriceCents !== undefined) updates.minPriceCents = input.minPriceCents;
  if (input.maxPriceCents !== undefined) updates.maxPriceCents = input.maxPriceCents;
  if (input.boundToUserIds)
    updates.boundToUserIds = input.boundToUserIds.map((id) => new Types.ObjectId(id));
  if (input.boundToTerritoryIds)
    updates.boundToTerritoryIds = input.boundToTerritoryIds.map(
      (id) => new Types.ObjectId(id)
    );
  if (input.boundToCustomerIds)
    updates.boundToCustomerIds = input.boundToCustomerIds.map(
      (id) => new Types.ObjectId(id)
    );
  if (input.pricingMatrix !== undefined) {
    updates.pricingMatrix = input.pricingMatrix.map((row) => ({
      label: row.label ?? "",
      paymentMethod: row.paymentMethod,
      installmentPlanId: row.installmentPlanId
        ? new Types.ObjectId(row.installmentPlanId)
        : null,
      advanceMinCents: row.advanceMinCents ?? null,
      advanceMaxCents: row.advanceMaxCents ?? null,
      finalPriceCents: row.finalPriceCents ?? null,
      finalPricePct: row.finalPricePct ?? null,
      agentBp: row.agentBp ?? null,
      agentPct: row.agentPct ?? null,
      managerBp: row.managerBp ?? null,
      managerPct: row.managerPct ?? null,
    }));
  }

  const updated = await SolutionVersion.findByIdAndUpdate(versionId, updates, {
    new: true,
  });
  if (!updated) throw new HttpError(404, "Solution version not found");

  events.emit("solution.version.updated", {
    solutionId: updated.solutionId.toString(),
    versionId: updated._id.toString(),
  });

  return updated;
}

/**
 * Per Review 1.2 (2026-05-04): resolve effective pricing for a contract being
 * created against a solution version. Walks the pricingMatrix to find the
 * row that matches `paymentMethod × installmentPlanId × advanceCents`; falls
 * back to the version's defaults when no row matches. `*Pct` fields are
 * computed against the version's `basePriceCents`/`agentBp`/`managerBp`.
 */
export type ResolvedPricing = {
  finalPriceCents: number;
  agentBp: number;
  managerBp: number;
  rowLabel?: string;
  matched: boolean;
};

export function resolvePricing(
  version: {
    basePriceCents: number;
    agentBp: number;
    managerBp: number;
    pricingMatrix?: PricingMatrixRow[];
  },
  ctx: {
    paymentMethod: "ONE_TIME" | "ADVANCE_INSTALLMENTS" | "FULL_INSTALLMENTS";
    installmentPlanId?: string | null;
    advanceCents?: number;
  }
): ResolvedPricing {
  const rows = version.pricingMatrix ?? [];
  const planKey = ctx.installmentPlanId ? ctx.installmentPlanId.toString() : null;
  const advance = ctx.advanceCents ?? 0;
  const match = rows.find((r) => {
    if (r.paymentMethod !== ctx.paymentMethod) return false;
    const rowPlan = r.installmentPlanId
      ? r.installmentPlanId.toString()
      : null;
    if (rowPlan !== planKey) return false;
    if (r.advanceMinCents !== null && r.advanceMinCents !== undefined && advance < r.advanceMinCents)
      return false;
    if (r.advanceMaxCents !== null && r.advanceMaxCents !== undefined && advance > r.advanceMaxCents)
      return false;
    return true;
  });

  const base = version.basePriceCents;
  const finalPriceCents = match
    ? match.finalPriceCents !== null && match.finalPriceCents !== undefined
      ? match.finalPriceCents
      : match.finalPricePct !== null && match.finalPricePct !== undefined
        ? Math.round((base * match.finalPricePct) / 100)
        : base
    : base;
  const agentBp = match
    ? match.agentBp !== null && match.agentBp !== undefined
      ? match.agentBp
      : match.agentPct !== null && match.agentPct !== undefined
        ? Math.round(match.agentPct * 100)
        : version.agentBp
    : version.agentBp;
  const managerBp = match
    ? match.managerBp !== null && match.managerBp !== undefined
      ? match.managerBp
      : match.managerPct !== null && match.managerPct !== undefined
        ? Math.round(match.managerPct * 100)
        : version.managerBp
    : version.managerBp;

  return {
    finalPriceCents,
    agentBp,
    managerBp,
    rowLabel: match?.label,
    matched: !!match,
  };
}
