import { Types } from "mongoose";
import { Commission } from "../commissions/commission.model";
import { Contract } from "../contracts/contract.model";
import { Installation } from "../installations/installation.model";
import { Payment } from "../payments/payment.model";
import { User } from "../users/user.model";
import { Bonus } from "../bonuses/bonus.model";

// Per Review 1.2 (2026-05-04): support multiple periods (passed as
// `periods=p1,p2,…`) on the aggregate reports, plus a per-agent drill-down.
// `period` (single) continues to work for backward compatibility.
export async function agentEarnings(opts: { period?: string; periods?: string[] }) {
  const match: Record<string, unknown> = { supersededAt: null, beneficiaryRole: "AGENT" };
  if (opts.periods && opts.periods.length > 0) {
    match.period = { $in: opts.periods };
  } else if (opts.period) {
    match.period = opts.period;
  }

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

/**
 * Per Review 1.2 (2026-05-04): drill-down detail for a single agent's
 * earnings — every commission row backing the aggregated total, plus the
 * contract metadata so the UI can link back to each contract.
 */
export async function agentEarningsDetail(opts: {
  userId: string;
  periods?: string[];
}) {
  const match: Record<string, unknown> = {
    supersededAt: null,
    beneficiaryUserId: new Types.ObjectId(opts.userId),
  };
  if (opts.periods && opts.periods.length > 0) match.period = { $in: opts.periods };
  const rows = await Commission.find(match)
    .sort({ generatedAt: -1 })
    .limit(500)
    .lean();
  const contractIds = rows
    .filter((r) => !!r.contractId)
    .map((r) => r.contractId);
  const contracts = await Contract.find(
    { _id: { $in: contractIds } },
    { customerId: 1, amountCents: 1, currency: 1, status: 1, signedAt: 1 }
  ).lean();
  const cMap = new Map(contracts.map((c) => [c._id.toString(), c]));
  return rows.map((r) => ({
    _id: r._id.toString(),
    contractId: r.contractId ? r.contractId.toString() : null,
    contract: r.contractId ? cMap.get(r.contractId.toString()) ?? null : null,
    role: r.beneficiaryRole,
    sourceEvent: r.sourceEvent,
    amountCents: r.amountCents,
    currency: r.currency,
    period: r.period,
    generatedAt: r.generatedAt,
    reason: r.reason,
  }));
}

/**
 * Per Review 1.2 (2026-05-04): drill-down for a single area manager —
 * agents in their network plus the contracts those agents signed.
 */
export async function networkPerformanceDetail(opts: {
  managerId: string;
  periods?: string[];
}) {
  const agents = await User.find({
    managerId: new Types.ObjectId(opts.managerId),
    role: "AGENT",
    deletedAt: null,
  }).select("_id fullName email territoryId");
  const agentIds = agents.map((a) => a._id);
  const contractMatch: Record<string, unknown> = {
    agentId: { $in: agentIds },
    status: "SIGNED",
  };
  if (opts.periods && opts.periods.length > 0) {
    // Convert period (YYYY-MM) → signedAt range OR.
    const rangeOr = opts.periods
      .map((p) => {
        const parts = p.split("-").map(Number);
        const y = parts[0];
        const m = parts[1];
        if (y === undefined || m === undefined) return null;
        const from = new Date(Date.UTC(y, m - 1, 1));
        const to = new Date(Date.UTC(y, m, 1));
        return { signedAt: { $gte: from, $lt: to } };
      })
      .filter((x): x is { signedAt: { $gte: Date; $lt: Date } } => x !== null);
    if (rangeOr.length > 0) contractMatch.$or = rangeOr;
  }
  const contracts = await Contract.find(contractMatch)
    .sort({ signedAt: -1 })
    .limit(500)
    .select("_id agentId customerId amountCents currency status signedAt paymentMethod")
    .lean();
  return {
    agents: agents.map((a) => ({
      userId: a._id.toString(),
      fullName: a.fullName,
      email: a.email,
      territoryId: a.territoryId?.toString() ?? null,
    })),
    contracts: contracts.map((c) => ({
      _id: c._id.toString(),
      agentId: c.agentId.toString(),
      customerId: c.customerId.toString(),
      amountCents: c.amountCents,
      currency: c.currency,
      status: c.status,
      signedAt: c.signedAt,
      paymentMethod: c.paymentMethod,
    })),
  };
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
