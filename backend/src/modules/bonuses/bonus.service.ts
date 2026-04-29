import { Types } from "mongoose";
import { Bonus } from "./bonus.model";
import { BonusRule } from "../catalog/bonus-rule.model";
import { Commission } from "../commissions/commission.model";
import { User, type UserRole } from "../users/user.model";
import { Contract } from "../contracts/contract.model";
import { Installation } from "../installations/installation.model";
import { calcCommissionCents } from "../../lib/money";
import { events } from "../../lib/events";
import { logger } from "../../utils/logger";

export function periodBounds(period: string): { from: Date; to: Date } {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`Invalid period format: ${period} (expected YYYY-MM)`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from, to };
}

export function previousPeriod(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function activeAgentIdsUnderManager(managerId: string): Promise<string[]> {
  const ids = await User.find({
    managerId,
    role: "AGENT",
    deletedAt: null,
  }).distinct("_id");
  return ids.map((x) => x.toString());
}

async function evaluateForUser(
  userId: string,
  role: UserRole,
  conditionType: string,
  from: Date,
  to: Date
): Promise<{ qualifierCount: number; baseAmountCents: number; reason?: string }> {
  let agentIds: string[];
  if (conditionType === "AGENT_INSTALLATIONS_GTE") {
    agentIds = [userId];
  } else if (conditionType === "NETWORK_INSTALLATIONS_GTE") {
    if (role !== "AREA_MANAGER")
      return { qualifierCount: 0, baseAmountCents: 0, reason: "wrong-role-for-network" };
    agentIds = await activeAgentIdsUnderManager(userId);
    if (agentIds.length === 0)
      return { qualifierCount: 0, baseAmountCents: 0, reason: "no-agents-in-network" };
  } else {
    return { qualifierCount: 0, baseAmountCents: 0, reason: "unknown-condition" };
  }

  const contractIds = await Contract.find({
    agentId: { $in: agentIds },
    status: "SIGNED",
  }).distinct("_id");

  if (contractIds.length === 0)
    return { qualifierCount: 0, baseAmountCents: 0, reason: "no-signed-contracts" };

  const installations = await Installation.find({
    contractId: { $in: contractIds },
    activatedAt: { $gte: from, $lt: to },
  }).select("contractId");

  if (installations.length === 0)
    return { qualifierCount: 0, baseAmountCents: 0, reason: "no-activations-in-period" };

  const activatedContractIds = installations.map((i) => i.contractId);

  const sum = await Commission.aggregate<{ _id: null; total: number }>([
    {
      $match: {
        beneficiaryUserId: new Types.ObjectId(userId),
        contractId: { $in: activatedContractIds },
        sourceEvent: "CONTRACT_SIGNED",
        supersededAt: null,
      },
    },
    { $group: { _id: null, total: { $sum: "$amountCents" } } },
  ]);

  return {
    qualifierCount: installations.length,
    baseAmountCents: sum[0]?.total ?? 0,
  };
}

export type CandidateOutcome = {
  userId: string;
  fullName: string;
  ruleName: string;
  ruleId: string;
  qualifierCount: number;
  threshold: number;
  baseAmountCents: number;
  bonusAmountCents: number;
  status:
    | "CREATED"
    | "ALREADY_EXISTED"
    | "BELOW_THRESHOLD"
    | "ZERO_BASE"
    | "WRONG_ROLE_FOR_NETWORK"
    | "NO_AGENTS_IN_NETWORK"
    | "NO_SIGNED_CONTRACTS"
    | "NO_ACTIVATIONS_IN_PERIOD"
    | "DUPLICATE_KEY";
  message?: string;
};

export type RunSummary = {
  period: string;
  rulesEvaluated: number;
  candidatesConsidered: number;
  bonusesCreated: number;
  bonusesSkippedExisting: number;
  bonusesNotQualified: number;
  outcomes: CandidateOutcome[];
};

const REASON_TO_STATUS: Record<string, CandidateOutcome["status"]> = {
  "wrong-role-for-network": "WRONG_ROLE_FOR_NETWORK",
  "no-agents-in-network": "NO_AGENTS_IN_NETWORK",
  "no-signed-contracts": "NO_SIGNED_CONTRACTS",
  "no-activations-in-period": "NO_ACTIVATIONS_IN_PERIOD",
};

export async function runForPeriod(period: string): Promise<RunSummary> {
  const { from, to } = periodBounds(period);
  const evalDate = new Date(to.getTime() - 1);
  const rules = await BonusRule.find({
    deletedAt: null,
    validFrom: { $lte: evalDate },
    $or: [{ validTo: null }, { validTo: { $gt: evalDate } }],
  });

  const outcomes: CandidateOutcome[] = [];
  let bonusesCreated = 0;
  let bonusesSkippedExisting = 0;
  let bonusesNotQualified = 0;
  let candidatesConsidered = 0;

  for (const rule of rules) {
    const candidates = await User.find({ role: rule.role, deletedAt: null }).select(
      "_id role fullName"
    );

    for (const candidate of candidates) {
      candidatesConsidered++;
      const userId = candidate._id.toString();
      const fullName = (candidate as { fullName?: string }).fullName ?? "(unknown)";

      const existing = await Bonus.findOne({ userId, period, ruleId: rule._id });
      if (existing) {
        bonusesSkippedExisting++;
        outcomes.push({
          userId,
          fullName,
          ruleName: rule.name,
          ruleId: rule._id.toString(),
          qualifierCount: existing.qualifierCount,
          threshold: rule.threshold,
          baseAmountCents: existing.baseAmountCents,
          bonusAmountCents: existing.bonusAmountCents,
          status: "ALREADY_EXISTED",
        });
        continue;
      }

      const evalResult = await evaluateForUser(
        userId,
        candidate.role as UserRole,
        rule.conditionType,
        from,
        to
      );

      if (evalResult.reason) {
        bonusesNotQualified++;
        outcomes.push({
          userId,
          fullName,
          ruleName: rule.name,
          ruleId: rule._id.toString(),
          qualifierCount: evalResult.qualifierCount,
          threshold: rule.threshold,
          baseAmountCents: evalResult.baseAmountCents,
          bonusAmountCents: 0,
          status: REASON_TO_STATUS[evalResult.reason] ?? "BELOW_THRESHOLD",
        });
        continue;
      }

      if (evalResult.qualifierCount < rule.threshold) {
        bonusesNotQualified++;
        outcomes.push({
          userId,
          fullName,
          ruleName: rule.name,
          ruleId: rule._id.toString(),
          qualifierCount: evalResult.qualifierCount,
          threshold: rule.threshold,
          baseAmountCents: evalResult.baseAmountCents,
          bonusAmountCents: 0,
          status: "BELOW_THRESHOLD",
        });
        continue;
      }

      const bonusAmountCents = calcCommissionCents(
        evalResult.baseAmountCents,
        rule.basisPoints
      );
      if (bonusAmountCents === 0) {
        bonusesNotQualified++;
        outcomes.push({
          userId,
          fullName,
          ruleName: rule.name,
          ruleId: rule._id.toString(),
          qualifierCount: evalResult.qualifierCount,
          threshold: rule.threshold,
          baseAmountCents: evalResult.baseAmountCents,
          bonusAmountCents: 0,
          status: "ZERO_BASE",
          message:
            "Threshold met but base commission was 0 (likely no commissions on activated contracts).",
        });
        continue;
      }

      const commission = await Commission.create({
        beneficiaryUserId: userId,
        beneficiaryRole: candidate.role,
        sourceEvent:
          rule.conditionType === "AGENT_INSTALLATIONS_GTE"
            ? "BONUS_AGENT_INSTALLATIONS"
            : "BONUS_NETWORK_INSTALLATIONS",
        amountCents: bonusAmountCents,
        currency: "EUR",
        period,
        reason: `Bonus rule: ${rule.name}`,
        metadata: {
          ruleId: rule._id,
          qualifierCount: evalResult.qualifierCount,
          baseAmountCents: evalResult.baseAmountCents,
          basisPoints: rule.basisPoints,
        },
      });

      try {
        await Bonus.create({
          userId,
          period,
          ruleId: rule._id,
          qualifierCount: evalResult.qualifierCount,
          baseAmountCents: evalResult.baseAmountCents,
          basisPoints: rule.basisPoints,
          bonusAmountCents,
          commissionId: commission._id,
        });
        bonusesCreated++;
        outcomes.push({
          userId,
          fullName,
          ruleName: rule.name,
          ruleId: rule._id.toString(),
          qualifierCount: evalResult.qualifierCount,
          threshold: rule.threshold,
          baseAmountCents: evalResult.baseAmountCents,
          bonusAmountCents,
          status: "CREATED",
        });
        events.emit("bonus.calculated", { userId, period, amountCents: bonusAmountCents });
      } catch (err) {
        await Commission.deleteOne({ _id: commission._id });
        if ((err as { code?: number }).code === 11000) {
          bonusesSkippedExisting++;
          outcomes.push({
            userId,
            fullName,
            ruleName: rule.name,
            ruleId: rule._id.toString(),
            qualifierCount: evalResult.qualifierCount,
            threshold: rule.threshold,
            baseAmountCents: evalResult.baseAmountCents,
            bonusAmountCents,
            status: "DUPLICATE_KEY",
          });
          continue;
        }
        throw err;
      }
    }
  }

  const summary: RunSummary = {
    period,
    rulesEvaluated: rules.length,
    candidatesConsidered,
    bonusesCreated,
    bonusesSkippedExisting,
    bonusesNotQualified,
    outcomes,
  };

  logger.info(
    {
      period,
      rulesEvaluated: summary.rulesEvaluated,
      candidatesConsidered,
      bonusesCreated,
      bonusesSkippedExisting,
      bonusesNotQualified,
    },
    "Bonus run complete"
  );
  return summary;
}

export async function listBonuses(filter: { userId?: string; period?: string }) {
  const q: Record<string, unknown> = {};
  if (filter.userId) q.userId = filter.userId;
  if (filter.period) q.period = filter.period;
  return Bonus.find(q).sort({ createdAt: -1 }).limit(200);
}

/**
 * Wipe and re-run bonuses for a period. Used when bonus rules change retroactively.
 * Supersedes existing bonus commissions, deletes Bonus rows so re-run regenerates fresh.
 */
export async function recalcForPeriod(period: string): Promise<RunSummary> {
  const existing = await Bonus.find({ period }).select("_id commissionId");
  const commissionIds = existing.map((b) => b.commissionId).filter(Boolean);

  if (commissionIds.length > 0) {
    await Commission.updateMany(
      { _id: { $in: commissionIds }, supersededAt: null },
      { supersededAt: new Date(), reason: `bonus.recalc for period ${period}` }
    );
  }
  await Bonus.deleteMany({ period });

  logger.info(
    { period, supersededCommissions: commissionIds.length, deletedBonuses: existing.length },
    "Period wiped — re-running bonus job"
  );
  return runForPeriod(period);
}
