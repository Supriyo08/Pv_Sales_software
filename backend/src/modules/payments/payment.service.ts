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
  const result = await Commission.aggregate<{ _id: null; total: number }>([
    {
      $match: {
        beneficiaryUserId: { $eq: new (await import("mongoose")).Types.ObjectId(userId) },
        supersededAt: null,
        $or: [{ period }, { period: null }],
      },
    },
    { $group: { _id: null, total: { $sum: "$amountCents" } } },
  ]);
  return result[0]?.total ?? 0;
}
