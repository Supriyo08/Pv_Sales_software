import { Commission } from "../commissions/commission.model";
import { Contract } from "../contracts/contract.model";
import { Installation } from "../installations/installation.model";
import { Payment } from "../payments/payment.model";
import { User } from "../users/user.model";
import { Bonus } from "../bonuses/bonus.model";

export async function agentEarnings(opts: { period?: string }) {
  const match: Record<string, unknown> = { supersededAt: null, beneficiaryRole: "AGENT" };
  if (opts.period) match.period = opts.period;

  const grouped = await Commission.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$beneficiaryUserId",
        totalCents: { $sum: "$amountCents" },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        fullName: "$user.fullName",
        email: "$user.email",
        totalCents: 1,
        count: 1,
      },
    },
    { $sort: { totalCents: -1 } },
  ]);
  return grouped;
}

export async function networkPerformance() {
  const managers = await User.find({ role: "AREA_MANAGER", deletedAt: null }).select(
    "_id fullName email"
  );

  const out = [];
  for (const m of managers) {
    const agentIds = await User.find({
      managerId: m._id,
      role: "AGENT",
      deletedAt: null,
    }).distinct("_id");
    const contractIds = await Contract.find({
      agentId: { $in: agentIds },
      status: "SIGNED",
    }).distinct("_id");
    const totals = await Contract.aggregate<{ _id: null; total: number; count: number }>([
      { $match: { _id: { $in: contractIds } } },
      { $group: { _id: null, total: { $sum: "$amountCents" }, count: { $sum: 1 } } },
    ]);
    const installCount = await Installation.countDocuments({
      contractId: { $in: contractIds },
      status: "ACTIVATED",
    });
    out.push({
      managerId: m._id,
      fullName: m.fullName,
      email: m.email,
      agentCount: agentIds.length,
      contractCount: totals[0]?.count ?? 0,
      contractAmountCents: totals[0]?.total ?? 0,
      activatedInstallations: installCount,
    });
  }
  out.sort((a, b) => b.contractAmountCents - a.contractAmountCents);
  return out;
}

export async function paymentSummary() {
  const grouped = await Payment.aggregate<{ _id: string; count: number; totalCents: number }>([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalCents: { $sum: "$totalAmountCents" },
      },
    },
  ]);
  const byStatus: Record<string, { count: number; totalCents: number }> = {};
  for (const g of grouped) byStatus[g._id] = { count: g.count, totalCents: g.totalCents };
  return byStatus;
}

export async function pipelineFunnel() {
  const grouped = await Contract.aggregate<{ _id: string; count: number; totalCents: number }>([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalCents: { $sum: "$amountCents" },
      },
    },
  ]);
  const byStatus: Record<string, { count: number; totalCents: number }> = {};
  for (const g of grouped) byStatus[g._id] = { count: g.count, totalCents: g.totalCents };
  return byStatus;
}

export async function bonusSummary(opts: { period?: string }) {
  const match: Record<string, unknown> = {};
  if (opts.period) match.period = opts.period;

  const grouped = await Bonus.aggregate([
    { $match: match },
    {
      $group: {
        _id: { period: "$period", userId: "$userId" },
        bonusCount: { $sum: 1 },
        totalBonusCents: { $sum: "$bonusAmountCents" },
        totalBaseCents: { $sum: "$baseAmountCents" },
        totalQualifierCount: { $sum: "$qualifierCount" },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id.userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        period: "$_id.period",
        userId: "$_id.userId",
        fullName: "$user.fullName",
        email: "$user.email",
        role: "$user.role",
        bonusCount: 1,
        totalBonusCents: 1,
        totalBaseCents: 1,
        totalQualifierCount: 1,
      },
    },
    { $sort: { period: -1, totalBonusCents: -1 } },
  ]);
  return grouped;
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>())
  );
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}
