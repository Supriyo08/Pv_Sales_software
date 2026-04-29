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
): Promise<{ qualifierCount: number; baseAmountCents: number }> {
  let agentIds: string[];
  if (conditionType === "AGENT_INSTALLATIONS_GTE") {
    agentIds = [userId];
  } else if (conditionType === "NETWORK_INSTALLATIONS_GTE") {
    if (role !== "AREA_MANAGER") return { qualifierCount: 0, baseAmountCents: 0 };
    agentIds = await activeAgentIdsUnderManager(userId);
    if (agentIds.length === 0) return { qualifierCount: 0, baseAmountCents: 0 };
  } else {
    return { qualifierCount: 0, baseAmountCents: 0 };
  }

  const contractIds = await Contract.find({
    agentId: { $in: agentIds },
    status: "SIGNED",
  }).distinct("_id");

  if (contractIds.length === 0) return { qualifierCount: 0, baseAmountCents: 0 };

  const installations = await Installation.find({
    contractId: { $in: contractIds },
    activatedAt: { $gte: from, $lt: to },
  }).select("contractId");

  if (installations.length === 0) return { qualifierCount: 0, baseAmountCents: 0 };

  const activatedContractIds = installations.map((i) => i.contractId);
  const sum = await Contract.aggregate<{ _id: null; total: number }>([
    { $match: { _id: { $in: activatedContractIds } } },
    { $group: { _id: null, total: { $sum: "$amountCents" } } },
  ]);

  return {
    qualifierCount: installations.length,
    baseAmountCents: sum[0]?.total ?? 0,
  };
}

export async function runForPeriod(period: string) {
  const { from, to } = periodBounds(period);
  const evalDate = new Date(to.getTime() - 1);
  const rules = await BonusRule.find({
    deletedAt: null,
    validFrom: { $lte: evalDate },
    $or: [{ validTo: null }, { validTo: { $gt: evalDate } }],
  });

  const summary = {
    period,
    rulesEvaluated: rules.length,
    bonusesCreated: 0,
    bonusesSkipped: 0,
  };

  for (const rule of rules) {
    const candidates = await User.find({ role: rule.role, deletedAt: null }).select("_id role");
    for (const candidate of candidates) {
      const userId = candidate._id.toString();
      const existing = await Bonus.findOne({ userId, period, ruleId: rule._id });
      if (existing) {
        summary.bonusesSkipped++;
        continue;
      }

      const { qualifierCount, baseAmountCents } = await evaluateForUser(
        userId,
        candidate.role as UserRole,
        rule.conditionType,
        from,
        to
      );
      if (qualifierCount < rule.threshold) continue;

      const bonusAmountCents = calcCommissionCents(baseAmountCents, rule.basisPoints);
      if (bonusAmountCents === 0) continue;

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
          qualifierCount,
          baseAmountCents,
          basisPoints: rule.basisPoints,
        },
      });

      try {
        await Bonus.create({
          userId,
          period,
          ruleId: rule._id,
          qualifierCount,
          baseAmountCents,
          basisPoints: rule.basisPoints,
          bonusAmountCents,
          commissionId: commission._id,
        });
        summary.bonusesCreated++;
        events.emit("bonus.calculated", { userId, period, amountCents: bonusAmountCents });
      } catch (err) {
        await Commission.deleteOne({ _id: commission._id });
        if ((err as { code?: number }).code === 11000) {
          summary.bonusesSkipped++;
          continue;
        }
        throw err;
      }
    }
  }

  logger.info(summary, "Bonus run complete");
  return summary;
}

export async function listBonuses(filter: { userId?: string; period?: string }) {
  const q: Record<string, unknown> = {};
  if (filter.userId) q.userId = filter.userId;
  if (filter.period) q.period = filter.period;
  return Bonus.find(q).sort({ createdAt: -1 }).limit(200);
}
