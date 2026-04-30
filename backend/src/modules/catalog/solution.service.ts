import { Types } from "mongoose";
import { Solution } from "./solution.model";
import { SolutionVersion } from "./solution-version.model";
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

type UpdateVersionInput = {
  active?: boolean;
  minPriceCents?: number | null;
  maxPriceCents?: number | null;
  boundToUserIds?: string[];
  boundToTerritoryIds?: string[];
  boundToCustomerIds?: string[];
};

export async function listSolutions() {
  return Solution.find({ deletedAt: null }).sort({ name: 1 });
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
