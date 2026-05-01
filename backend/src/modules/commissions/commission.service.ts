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
