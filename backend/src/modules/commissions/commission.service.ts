import { Types, type HydratedDocument } from "mongoose";
import { Commission, type CommissionDoc } from "./commission.model";
import { Contract } from "../contracts/contract.model";
import { Customer } from "../customers/customer.model";
import { User } from "../users/user.model";
import { SolutionVersion } from "../catalog/solution-version.model";
import { calcCommissionCents } from "../../lib/money";
import { logger } from "../../utils/logger";

type CommissionHydrated = HydratedDocument<CommissionDoc>;

type ListFilter = {
  beneficiaryUserId?: string;
  contractId?: string;
  active?: boolean;
  period?: string;
};

export async function list(filter: ListFilter) {
  const q: Record<string, unknown> = {};
  if (filter.beneficiaryUserId) q.beneficiaryUserId = filter.beneficiaryUserId;
  if (filter.contractId) q.contractId = filter.contractId;
  if (filter.period) q.period = filter.period;
  if (filter.active === true) q.supersededAt = null;
  return Commission.find(q).sort({ generatedAt: -1 }).limit(500);
}

export async function generateForContract(
  contractId: string,
  reason = "auto-generated on contract.signed",
  opts: { useActiveVersion?: boolean } = {}
) {
  const contract = await Contract.findById(contractId);
  if (!contract) {
    logger.warn({ contractId }, "Cannot generate commissions: contract not found");
    return [];
  }

  let version;
  if (opts.useActiveVersion) {
    const at = contract.signedAt ?? contract.createdAt;
    const sourceVersion = await SolutionVersion.findById(contract.solutionVersionId).lean();
    if (!sourceVersion) {
      logger.warn({ contractId }, "Cannot recalc: original version missing");
      return [];
    }
    version = await SolutionVersion.findOne({
      solutionId: sourceVersion.solutionId,
      validFrom: { $lte: at },
      $or: [{ validTo: null }, { validTo: { $gt: at } }],
    })
      .sort({ validFrom: -1 })
      .lean();
    if (!version) {
      logger.warn({ contractId }, "No active version at contract date");
      return [];
    }
  } else {
    version = await SolutionVersion.findById(contract.solutionVersionId).lean();
    if (!version) {
      logger.warn({ contractId }, "Cannot generate commissions: solution version not found");
      return [];
    }
  }
  const versionId = version._id;

  const created: CommissionHydrated[] = [];
  const period = derivePeriod(contract.signedAt ?? contract.createdAt);

  // Per Review 1.0 §6: standard commission is paid on contract signature, *adjusted by
  // payment method*. The "effective base" reduces the contract amount when the payment is
  // financed (FULL_INSTALLMENTS), reflecting deferred-payment risk. ONE_TIME and
  // ADVANCE_INSTALLMENTS take the full amount.
  const effectiveBaseCents = await effectiveBaseForCommission(contract);

  // Per Review 1.1 §6: customer.commissionSplit allows splitting the agent
  // commission across multiple agents and overriding which AM gets the override.
  // Falls back to single-agent behavior when no split configured.
  const customer = await Customer.findById(contract.customerId).lean();
  const split = customer?.commissionSplit ?? null;
  const splits =
    split && split.agentSplits && split.agentSplits.length > 0
      ? split.agentSplits.map((e) => ({
          userId: e.userId.toString(),
          bp: e.bp,
        }))
      : [{ userId: contract.agentId.toString(), bp: 10_000 }];

  let totalAgentCommissionCents = 0;
  if (version.agentBp > 0) {
    for (const entry of splits) {
      // amount = effectiveBase * agentBp * splitBp / 1e8 (basis-points × basis-points)
      const fullForThisAgent = calcCommissionCents(effectiveBaseCents, version.agentBp);
      const portionCents = Math.round((fullForThisAgent * entry.bp) / 10_000);
      if (portionCents <= 0) continue;
      const c = await Commission.create({
        contractId,
        beneficiaryUserId: entry.userId,
        beneficiaryRole: "AGENT",
        sourceEvent: "CONTRACT_SIGNED",
        amountCents: portionCents,
        currency: contract.currency,
        period,
        reason,
        metadata: {
          solutionVersionId: versionId,
          bp: version.agentBp,
          splitBp: entry.bp,
          baseCents: effectiveBaseCents,
          contractAmountCents: contract.amountCents,
          paymentMethod: contract.paymentMethod,
          baseKind: "CONTRACT_AMOUNT",
          isSplit: splits.length > 1,
        },
      });
      created.push(c);
      totalAgentCommissionCents += portionCents;
    }
  }

  // Manager override is calculated on the TOTAL AGENT commission (sum across splits),
  // not the contract amount. Additive — does not deduct from the agent.
  // Per Review 1.1 §6: if customer.commissionSplit.managerOverrideBeneficiaryId is
  // set, that user receives the override instead of contract.managerId.
  let managerBeneficiaryId: Types.ObjectId | null = null;
  if (split?.managerOverrideBeneficiaryId) {
    managerBeneficiaryId = split.managerOverrideBeneficiaryId as Types.ObjectId;
  } else if (contract.managerId) {
    managerBeneficiaryId = contract.managerId as Types.ObjectId;
  } else if (splits.length > 0) {
    // No managerId on contract — derive from primary agent's manager.
    const primaryAgent = await User.findById(splits[0]!.userId).lean();
    managerBeneficiaryId = (primaryAgent?.managerId as Types.ObjectId) ?? null;
  }

  if (managerBeneficiaryId && version.managerBp > 0 && totalAgentCommissionCents > 0) {
    const managerCommissionCents = calcCommissionCents(
      totalAgentCommissionCents,
      version.managerBp
    );
    const c = await Commission.create({
      contractId,
      beneficiaryUserId: managerBeneficiaryId,
      beneficiaryRole: "AREA_MANAGER",
      sourceEvent: "CONTRACT_SIGNED",
      amountCents: managerCommissionCents,
      currency: contract.currency,
      period,
      reason,
      metadata: {
        solutionVersionId: versionId,
        bp: version.managerBp,
        baseCents: totalAgentCommissionCents,
        baseKind: "AGENT_COMMISSION",
        viaSplitOverride: !!split?.managerOverrideBeneficiaryId,
      },
    });
    created.push(c);
  }

  return created;
}

function derivePeriod(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Effective base for commission, adjusted by payment method.
 * - ONE_TIME, ADVANCE_INSTALLMENTS → full contract amount
 * - FULL_INSTALLMENTS → contract amount minus the InstallmentPlan's surchargeBp,
 *   modelling the cost of fully-deferred payment.
 *
 * Returns the original amount if anything required to compute the surcharge is missing
 * (defensive — never blows away commission on a bad lookup).
 */
export async function effectiveBaseForCommission(contract: {
  amountCents: number;
  paymentMethod?: string;
  installmentPlanId?: unknown;
}): Promise<number> {
  if (contract.paymentMethod !== "FULL_INSTALLMENTS") return contract.amountCents;
  if (!contract.installmentPlanId) return contract.amountCents;
  const { InstallmentPlan } = await import("../catalog/installment-plan.model");
  const plan = await InstallmentPlan.findById(
    contract.installmentPlanId as Types.ObjectId
  ).lean();
  if (!plan) return contract.amountCents;
  // Subtract surcharge: e.g. surchargeBp=500 (5%) → base * 0.95
  const reduction = Math.round((contract.amountCents * plan.surchargeBp) / 10_000);
  return Math.max(0, contract.amountCents - reduction);
}

/**
 * Per Review 1.2 (2026-05-04): dry-run commission calculator. Given a contract
 * and a user, returns what THIS user would earn from this contract — agent
 * portion (with split if configured) or manager override. Used by the agent
 * commission breakdown report so the agent can see "potential earnings"
 * before commissions actually fire.
 */
export async function potentialCommissionForUser(
  contract: {
    _id: unknown;
    amountCents: number;
    currency: string;
    paymentMethod?: string;
    installmentPlanId?: unknown;
    solutionVersionId: unknown;
    customerId: unknown;
    agentId: unknown;
    managerId?: unknown;
  },
  userId: string
): Promise<number> {
  const version = await SolutionVersion.findById(
    contract.solutionVersionId as Types.ObjectId
  ).lean();
  if (!version) return 0;
  const effectiveBase = await effectiveBaseForCommission(contract);
  const customer = await Customer.findById(
    contract.customerId as Types.ObjectId
  ).lean();
  const split = customer?.commissionSplit ?? null;
  const splits =
    split && split.agentSplits && split.agentSplits.length > 0
      ? split.agentSplits.map((e) => ({
          userId: e.userId.toString(),
          bp: e.bp,
        }))
      : [{ userId: (contract.agentId as Types.ObjectId).toString(), bp: 10_000 }];

  // Is this user one of the agent beneficiaries?
  const agentEntry = splits.find((s) => s.userId === userId);
  if (agentEntry && version.agentBp > 0) {
    const fullAgent = calcCommissionCents(effectiveBase, version.agentBp);
    return Math.round((fullAgent * agentEntry.bp) / 10_000);
  }

  // Is this user the manager beneficiary?
  let managerBeneficiaryId: string | null = null;
  if (split?.managerOverrideBeneficiaryId) {
    managerBeneficiaryId = split.managerOverrideBeneficiaryId.toString();
  } else if (contract.managerId) {
    managerBeneficiaryId = (contract.managerId as Types.ObjectId).toString();
  } else if (splits.length > 0) {
    const primaryAgent = await User.findById(splits[0]!.userId).lean();
    managerBeneficiaryId = primaryAgent?.managerId
      ? (primaryAgent.managerId as Types.ObjectId).toString()
      : null;
  }

  if (managerBeneficiaryId === userId && version.managerBp > 0) {
    let totalAgent = 0;
    for (const s of splits) {
      const fullAgent = calcCommissionCents(effectiveBase, version.agentBp);
      totalAgent += Math.round((fullAgent * s.bp) / 10_000);
    }
    return calcCommissionCents(totalAgent, version.managerBp);
  }

  return 0;
}

/**
 * Per Review 1.2 (2026-05-04): "you've these money that are potentially
 * yours; of these, X have been approved by the manager to be paid right
 * away, Y have been denied / pay only on installation."
 *
 * Buckets every approved contract this user has a stake in:
 *   - paid_early   : commission already in the ledger via early-pay AUTHORIZED
 *   - paid_after_install : commission in the ledger because installation activated
 *   - pending_early : auth still in PENDING_MANAGER or PENDING_ADMIN
 *   - deferred     : auth declined or no auth — will fire on install activation
 */
export async function commissionBreakdownForUser(userId: string) {
  const { AdvancePayAuthorization } = await import(
    "../advance-pay-authorizations/advance-pay-auth.model"
  );
  const userObjId = new Types.ObjectId(userId);

  // 1) Approved contracts where the user is the direct agent or manager.
  const direct = await Contract.find({
    status: "SIGNED",
    approvedAt: { $ne: null },
    $or: [{ agentId: userObjId }, { managerId: userObjId }],
  }).lean();

  // 2) Contracts where the user appears in a customer's commissionSplit.
  const customers = await Customer.find(
    {
      $or: [
        { "commissionSplit.agentSplits.userId": userObjId },
        { "commissionSplit.managerOverrideBeneficiaryId": userObjId },
        { "commissionSplit.managerBonusBeneficiaryId": userObjId },
      ],
    },
    { _id: 1 }
  ).lean();
  let viaSplit: typeof direct = [];
  if (customers.length > 0) {
    viaSplit = await Contract.find({
      customerId: { $in: customers.map((c) => c._id) },
      status: "SIGNED",
      approvedAt: { $ne: null },
    }).lean();
  }

  const seen = new Set<string>();
  const all: typeof direct = [];
  for (const c of [...direct, ...viaSplit]) {
    const k = c._id.toString();
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(c);
  }
  if (all.length === 0) {
    return {
      userId,
      totalPotentialCents: 0,
      paidEarlyCents: 0,
      paidAfterInstallCents: 0,
      pendingEarlyCents: 0,
      deferredCents: 0,
      pendingItemCount: 0,
      deferredItemCount: 0,
      paidEarlyItemCount: 0,
      paidAfterInstallItemCount: 0,
    };
  }

  const contractIds = all.map((c) => c._id);
  const auths = await AdvancePayAuthorization.find({
    contractId: { $in: contractIds },
  }).lean();
  const authByContract = new Map(
    auths.map((a) => [a.contractId.toString(), a])
  );

  const commissions = await Commission.find({
    beneficiaryUserId: userObjId,
    supersededAt: null,
    contractId: { $in: contractIds },
  }).lean();
  const paidByContract = new Map<string, number>();
  for (const c of commissions) {
    if (!c.contractId) continue;
    const k = c.contractId.toString();
    paidByContract.set(k, (paidByContract.get(k) ?? 0) + c.amountCents);
  }

  let paidEarlyCents = 0;
  let paidAfterInstallCents = 0;
  let pendingEarlyCents = 0;
  let deferredCents = 0;
  let pendingItemCount = 0;
  let deferredItemCount = 0;
  let paidEarlyItemCount = 0;
  let paidAfterInstallItemCount = 0;

  for (const contract of all) {
    const k = contract._id.toString();
    const actualPaid = paidByContract.get(k) ?? 0;
    const auth = authByContract.get(k);
    const status = auth?.status ?? null;

    if (actualPaid > 0) {
      // Already in the ledger — bucket by how it got there.
      if (status === "AUTHORIZED") {
        paidEarlyCents += actualPaid;
        paidEarlyItemCount++;
      } else {
        // Legacy contract.signed path or post-install deferred path — both
        // mean "paid". Treat anything-not-AUTHORIZED as paid_after_install.
        paidAfterInstallCents += actualPaid;
        paidAfterInstallItemCount++;
      }
      continue;
    }

    // No commission yet — estimate the potential amount.
    const potential = await potentialCommissionForUser(contract, userId);
    if (potential <= 0) continue;

    if (
      status === "PENDING" ||
      status === "PENDING_MANAGER" ||
      status === "PENDING_ADMIN"
    ) {
      pendingEarlyCents += potential;
      pendingItemCount++;
    } else {
      // DECLINED_*, RESOLVED_BY_INSTALL, or no auth — waiting on installation.
      deferredCents += potential;
      deferredItemCount++;
    }
  }

  const totalPotentialCents =
    paidEarlyCents + paidAfterInstallCents + pendingEarlyCents + deferredCents;

  return {
    userId,
    totalPotentialCents,
    paidEarlyCents,
    paidAfterInstallCents,
    pendingEarlyCents,
    deferredCents,
    pendingItemCount,
    deferredItemCount,
    paidEarlyItemCount,
    paidAfterInstallItemCount,
  };
}

export async function recalculateContractsForSolution(
  solutionId: string,
  reason: string
): Promise<{ recalculated: number; skipped: number }> {
  const solutionVersionIds = await SolutionVersion.find({ solutionId }).distinct("_id");
  const contracts = await Contract.find({
    status: "SIGNED",
    solutionVersionId: { $in: solutionVersionIds },
  })
    .select("_id signedAt createdAt solutionVersionId")
    .limit(1_000);

  let recalculated = 0;
  let skipped = 0;
  for (const contract of contracts) {
    try {
      const at = contract.signedAt ?? contract.createdAt;
      const activeVersion = await SolutionVersion.findOne({
        solutionId,
        validFrom: { $lte: at },
        $or: [{ validTo: null }, { validTo: { $gt: at } }],
      })
        .sort({ validFrom: -1 })
        .lean();

      if (!activeVersion) {
        skipped++;
        continue;
      }

      const fresh = await generateForContract(contract._id.toString(), reason, {
        useActiveVersion: true,
      });
      const newIds = fresh.map((c) => c._id);
      await Commission.updateMany(
        { contractId: contract._id, supersededAt: null, _id: { $nin: newIds } },
        { supersededAt: new Date(), reason }
      );
      recalculated++;
    } catch (err) {
      logger.error({ err, contractId: contract._id }, "Failed to recalc contract");
      skipped++;
    }
  }

  logger.info({ solutionId, recalculated, skipped, reason }, "Solution-wide recalc complete");
  return { recalculated, skipped };
}

export async function recalculateForContract(contractId: string, reason: string) {
  const fresh = await generateForContract(contractId, reason);
  const newIds = fresh.map((c) => c._id);
  await Commission.updateMany(
    {
      contractId,
      supersededAt: null,
      _id: { $nin: newIds },
    },
    { supersededAt: new Date(), reason }
  );
  return fresh;
}

export async function supersedeForContract(contractId: string, reason: string) {
  const result = await Commission.updateMany(
    { contractId, supersededAt: null },
    { supersededAt: new Date(), reason }
  );
  return result.modifiedCount;
}

export async function totalEarnedCents(userId: string, opts: { period?: string } = {}) {
  const match: Record<string, unknown> = {
    beneficiaryUserId: new Types.ObjectId(userId),
    supersededAt: null,
  };
  if (opts.period) match.period = opts.period;
  const result = await Commission.aggregate<{ _id: null; total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amountCents" } } },
  ]);
  return result[0]?.total ?? 0;
}

export async function countActiveInstallationsForAgent(
  agentId: string,
  from: Date,
  to: Date
): Promise<number> {
  const { Installation } = await import("../installations/installation.model");
  return Installation.countDocuments({
    activatedAt: { $gte: from, $lt: to },
    contractId: {
      $in: await Contract.find({ agentId, status: "SIGNED" }).distinct("_id"),
    },
  });
}
