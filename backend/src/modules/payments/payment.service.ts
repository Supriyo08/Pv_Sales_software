import { Payment, type PaymentStatus } from "./payment.model";
import {
  PaymentTransaction,
  type TransactionKind,
  type PaymentMethod,
} from "./payment-transaction.model";
import { Commission } from "../commissions/commission.model";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";

type CreateInput = {
  userId: string;
  period: string;
};

type AddTransactionInput = {
  paymentId: string;
  kind: TransactionKind;
  amountCents: number;
  method?: PaymentMethod | null;
  referenceNumber?: string | null;
  proofUrl?: string;
  notes?: string;
  createdBy: string;
};

export async function list(filter: { userId?: string; period?: string }) {
  const q: Record<string, unknown> = {};
  if (filter.userId) q.userId = filter.userId;
  if (filter.period) q.period = filter.period;
  return Payment.find(q).sort({ period: -1 }).limit(200);
}

export async function getById(id: string) {
  const p = await Payment.findById(id);
  if (!p) throw new HttpError(404, "Payment not found");
  return p;
}

export async function listTransactions(paymentId: string) {
  return PaymentTransaction.find({ paymentId }).sort({ executedAt: -1 });
}

export async function createOrUpdateForUserPeriod(input: CreateInput) {
  const totalCents = await sumActiveCommissionsForPeriod(input.userId, input.period);
  const existing = await Payment.findOne({ userId: input.userId, period: input.period });
  if (existing) {
    existing.totalAmountCents = totalCents;
    existing.status = await deriveStatus(existing._id.toString(), totalCents, existing);
    await existing.save();
    return existing;
  }
  const created = await Payment.create({
    userId: input.userId,
    period: input.period,
    totalAmountCents: totalCents,
    status: "PENDING",
  });
  events.emit("payment.created", {
    paymentId: created._id.toString(),
    userId: input.userId,
  });
  return created;
}

export async function addTransaction(input: AddTransactionInput) {
  const payment = await getById(input.paymentId);

  const tx = await PaymentTransaction.create({
    paymentId: payment._id,
    kind: input.kind,
    amountCents: input.amountCents,
    method: input.method ?? null,
    referenceNumber: input.referenceNumber ?? null,
    proofUrl: input.proofUrl ?? null,
    notes: input.notes ?? "",
    createdBy: input.createdBy,
  });

  await refreshPaymentStatus(payment._id.toString());
  return tx;
}

export async function cancelPayment(paymentId: string) {
  const payment = await getById(paymentId);
  payment.cancelled = true;
  payment.status = "CANCELLED";
  await payment.save();
  return payment;
}

async function refreshPaymentStatus(paymentId: string) {
  const payment = await Payment.findById(paymentId);
  if (!payment) return;
  payment.status = await deriveStatus(paymentId, payment.totalAmountCents, payment);
  payment.paidCents = await sumPaidCents(paymentId);
  await payment.save();
}

async function deriveStatus(
  paymentId: string,
  totalCents: number,
  payment: { cancelled?: boolean }
): Promise<PaymentStatus> {
  if (payment.cancelled) return "CANCELLED";

  const txs = await PaymentTransaction.find({ paymentId });
  const hasOpenDispute =
    txs.some((t) => t.kind === "DISPUTE") &&
    !txs.some((t) => t.kind === "RESOLVE_DISPUTE");
  if (hasOpenDispute) return "DISPUTED";

  const paid = txs.reduce((acc, t) => {
    if (t.kind === "PAY") return acc + t.amountCents;
    if (t.kind === "REFUND") return acc - t.amountCents;
    return acc;
  }, 0);

  if (paid <= 0) return "PENDING";
  if (paid >= totalCents) return "FULL";
  return "PARTIAL";
}

async function sumPaidCents(paymentId: string): Promise<number> {
  const txs = await PaymentTransaction.find({ paymentId, kind: { $in: ["PAY", "REFUND"] } });
  return txs.reduce((acc, t) => acc + (t.kind === "PAY" ? t.amountCents : -t.amountCents), 0);
}

async function sumActiveCommissionsForPeriod(userId: string, period: string): Promise<number> {
  const { Types } = await import("mongoose");
  const result = await Commission.aggregate<{ _id: null; total: number }>([
    {
      $match: {
        beneficiaryUserId: new Types.ObjectId(userId),
        supersededAt: null,
        period,
      },
    },
    { $group: { _id: null, total: { $sum: "$amountCents" } } },
  ]);
  return result[0]?.total ?? 0;
}

/**
 * Per Review 1.2 (2026-05-04): double-entry-style ledger of every financial
 * event in the system, sorted chronologically with a running balance per
 * beneficiary. Each row is one journal line — commissions paid (+),
 * commissions reversed (−), payment disbursements (−), payment refunds (+).
 *
 * Scope: caller decides via `userIds`. Admins pass undefined for all-company.
 */
export type LedgerKind =
  | "commission_paid"
  | "commission_reversed"
  | "bonus_paid"
  | "bonus_reversed"
  | "payment_disbursed"
  | "payment_refunded";

export type LedgerRow = {
  at: string;
  kind: LedgerKind;
  description: string;
  userId: string;
  contractId: string | null;
  period: string | null;
  amountCents: number; // signed: positive = credit, negative = debit
  runningBalanceCents: number; // per user, cumulative as of `at`
  reference: string | null;
};

export async function ledger(filter: {
  userIds?: string[];
  fromPeriod?: string;
  toPeriod?: string;
  periods?: string[];
}): Promise<LedgerRow[]> {
  const commissionMatch: Record<string, unknown> = {};
  if (filter.userIds && filter.userIds.length > 0) {
    commissionMatch.beneficiaryUserId = { $in: filter.userIds };
  }
  const commissions = await Commission.find(commissionMatch).lean();

  const txMatch: Record<string, unknown> = {};
  let paymentUserMap = new Map<string, string>();
  if (filter.userIds && filter.userIds.length > 0) {
    const paymentIds = await Payment.find({
      userId: { $in: filter.userIds },
    }).distinct("_id");
    txMatch.paymentId = { $in: paymentIds };
  }
  const txs = await PaymentTransaction.find(txMatch).lean();
  if (txs.length > 0) {
    const allPayments = await Payment.find({
      _id: { $in: txs.map((t) => t.paymentId) },
    }).lean();
    paymentUserMap = new Map(
      allPayments.map((p) => [p._id.toString(), p.userId.toString()])
    );
  }

  const events: Omit<LedgerRow, "runningBalanceCents">[] = [];

  for (const c of commissions) {
    const isBonus =
      c.sourceEvent === "BONUS_AGENT_INSTALLATIONS" ||
      c.sourceEvent === "BONUS_NETWORK_INSTALLATIONS";
    events.push({
      at: (c.generatedAt as Date).toISOString(),
      kind: isBonus ? "bonus_paid" : "commission_paid",
      description: isBonus
        ? `Bonus credited (${c.period ?? "—"})`
        : `Commission · ${c.beneficiaryRole} · ${c.sourceEvent}`,
      userId: c.beneficiaryUserId.toString(),
      contractId: c.contractId ? c.contractId.toString() : null,
      period: c.period ?? null,
      amountCents: c.amountCents,
      reference: c._id.toString(),
    });
    if (c.supersededAt) {
      events.push({
        at: (c.supersededAt as Date).toISOString(),
        kind: isBonus ? "bonus_reversed" : "commission_reversed",
        description: `Reversed: ${c.reason ?? "no reason"}`,
        userId: c.beneficiaryUserId.toString(),
        contractId: c.contractId ? c.contractId.toString() : null,
        period: c.period ?? null,
        amountCents: -c.amountCents,
        reference: c._id.toString(),
      });
    }
  }

  for (const t of txs) {
    const userId = paymentUserMap.get(t.paymentId.toString()) ?? "";
    if (!userId) continue;
    if (t.kind === "PAY") {
      events.push({
        at: (t.executedAt as Date).toISOString(),
        kind: "payment_disbursed",
        description: `Disbursed via ${t.method ?? "transfer"}${
          t.referenceNumber ? ` (${t.referenceNumber})` : ""
        }`,
        userId,
        contractId: null,
        period: null,
        amountCents: -t.amountCents,
        reference: t._id.toString(),
      });
    } else if (t.kind === "REFUND") {
      events.push({
        at: (t.executedAt as Date).toISOString(),
        kind: "payment_refunded",
        description: `Refund returned${
          t.referenceNumber ? ` (${t.referenceNumber})` : ""
        }`,
        userId,
        contractId: null,
        period: null,
        amountCents: t.amountCents,
        reference: t._id.toString(),
      });
    }
    // DISPUTE / RESOLVE_DISPUTE intentionally don't move the running balance.
  }

  let filtered = events;
  if (filter.periods && filter.periods.length > 0) {
    const set = new Set(filter.periods);
    filtered = filtered.filter((e) => {
      const period = e.period ?? `${e.at.slice(0, 4)}-${e.at.slice(5, 7)}`;
      return set.has(period);
    });
  }
  if (filter.fromPeriod) {
    filtered = filtered.filter((e) => {
      const period = e.period ?? `${e.at.slice(0, 4)}-${e.at.slice(5, 7)}`;
      return period >= filter.fromPeriod!;
    });
  }
  if (filter.toPeriod) {
    filtered = filtered.filter((e) => {
      const period = e.period ?? `${e.at.slice(0, 4)}-${e.at.slice(5, 7)}`;
      return period <= filter.toPeriod!;
    });
  }

  filtered.sort((a, b) => a.at.localeCompare(b.at));

  // Running balance per user.
  const balances = new Map<string, number>();
  return filtered.map((e) => {
    const next = (balances.get(e.userId) ?? 0) + e.amountCents;
    balances.set(e.userId, next);
    return { ...e, runningBalanceCents: next };
  });
}

/**
 * Per Review 1.2 (2026-05-04): "current situation" summary tile data.
 * Aggregates ledger rows into earned / reversed / disbursed / refunded
 * totals, plus per-user breakdown for the company-wide admin view.
 */
export async function summary(filter: { userIds?: string[] }) {
  const rows = await ledger(filter);
  const byUser = new Map<
    string,
    {
      earnedCents: number;
      reversedCents: number;
      disbursedCents: number;
      refundedCents: number;
    }
  >();
  let totalEarned = 0;
  let totalReversed = 0;
  let totalDisbursed = 0;
  let totalRefunded = 0;
  for (const r of rows) {
    const cur = byUser.get(r.userId) ?? {
      earnedCents: 0,
      reversedCents: 0,
      disbursedCents: 0,
      refundedCents: 0,
    };
    if (r.kind === "commission_paid" || r.kind === "bonus_paid") {
      cur.earnedCents += r.amountCents;
      totalEarned += r.amountCents;
    } else if (r.kind === "commission_reversed" || r.kind === "bonus_reversed") {
      cur.reversedCents += -r.amountCents;
      totalReversed += -r.amountCents;
    } else if (r.kind === "payment_disbursed") {
      cur.disbursedCents += -r.amountCents;
      totalDisbursed += -r.amountCents;
    } else if (r.kind === "payment_refunded") {
      cur.refundedCents += r.amountCents;
      totalRefunded += r.amountCents;
    }
    byUser.set(r.userId, cur);
  }
  const outstanding =
    totalEarned - totalReversed - totalDisbursed + totalRefunded;
  return {
    totals: {
      earnedCents: totalEarned,
      reversedCents: totalReversed,
      disbursedCents: totalDisbursed,
      refundedCents: totalRefunded,
      outstandingCents: outstanding,
    },
    byUser: Array.from(byUser.entries()).map(([userId, v]) => ({
      userId,
      ...v,
      outstandingCents:
        v.earnedCents - v.reversedCents - v.disbursedCents + v.refundedCents,
    })),
  };
}
