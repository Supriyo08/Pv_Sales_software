import { describe, expect, it } from "vitest";
import * as paymentService from "../src/modules/payments/payment.service";
import { Commission } from "../src/modules/commissions/commission.model";
import { makeUser } from "./factories";

async function seedCommission(userId: string, amountCents: number, period?: string) {
  return Commission.create({
    beneficiaryUserId: userId,
    beneficiaryRole: "AGENT",
    sourceEvent: "CONTRACT_SIGNED",
    amountCents,
    currency: "EUR",
    period: period ?? null,
    reason: "test",
  });
}

async function setupPayment() {
  const agent = await makeUser({ role: "AGENT" });
  await seedCommission(agent._id.toString(), 100_000, "2026-04");
  await seedCommission(agent._id.toString(), 50_000, "2026-04");
  const payment = await paymentService.createOrUpdateForUserPeriod({
    userId: agent._id.toString(),
    period: "2026-04",
  });
  return { agent, payment };
}

describe("payment.service status derivation", () => {
  it("PENDING when no transactions", async () => {
    const { payment } = await setupPayment();
    expect(payment.totalAmountCents).toBe(150_000);
    expect(payment.status).toBe("PENDING");
  });

  it("PARTIAL when paid < total", async () => {
    const { agent, payment } = await setupPayment();
    await paymentService.addTransaction({
      paymentId: payment._id.toString(),
      kind: "PAY",
      amountCents: 50_000,
      createdBy: agent._id.toString(),
    });
    const updated = await paymentService.getById(payment._id.toString());
    expect(updated.status).toBe("PARTIAL");
    expect(updated.paidCents).toBe(50_000);
  });

  it("FULL when paid >= total", async () => {
    const { agent, payment } = await setupPayment();
    await paymentService.addTransaction({
      paymentId: payment._id.toString(),
      kind: "PAY",
      amountCents: 150_000,
      createdBy: agent._id.toString(),
    });
    const updated = await paymentService.getById(payment._id.toString());
    expect(updated.status).toBe("FULL");
  });

  it("REFUND reduces paid amount → flips back to PARTIAL", async () => {
    const { agent, payment } = await setupPayment();
    await paymentService.addTransaction({
      paymentId: payment._id.toString(),
      kind: "PAY",
      amountCents: 150_000,
      createdBy: agent._id.toString(),
    });
    expect((await paymentService.getById(payment._id.toString())).status).toBe("FULL");
    await paymentService.addTransaction({
      paymentId: payment._id.toString(),
      kind: "REFUND",
      amountCents: 100_000,
      createdBy: agent._id.toString(),
    });
    const after = await paymentService.getById(payment._id.toString());
    expect(after.status).toBe("PARTIAL");
    expect(after.paidCents).toBe(50_000);
  });

  it("DISPUTE keeps status DISPUTED until RESOLVE_DISPUTE", async () => {
    const { agent, payment } = await setupPayment();
    await paymentService.addTransaction({
      paymentId: payment._id.toString(),
      kind: "DISPUTE",
      amountCents: 1,
      createdBy: agent._id.toString(),
    });
    expect((await paymentService.getById(payment._id.toString())).status).toBe("DISPUTED");

    await paymentService.addTransaction({
      paymentId: payment._id.toString(),
      kind: "RESOLVE_DISPUTE",
      amountCents: 1,
      createdBy: agent._id.toString(),
    });
    expect((await paymentService.getById(payment._id.toString())).status).toBe("PENDING");
  });

  it("CANCELLED overrides everything", async () => {
    const { payment } = await setupPayment();
    const cancelled = await paymentService.cancelPayment(payment._id.toString());
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("upsert reuses existing payment for same (userId, period)", async () => {
    const { agent, payment } = await setupPayment();
    await seedCommission(agent._id.toString(), 25_000, "2026-04");
    const updated = await paymentService.createOrUpdateForUserPeriod({
      userId: agent._id.toString(),
      period: "2026-04",
    });
    expect(updated._id.toString()).toBe(payment._id.toString());
    expect(updated.totalAmountCents).toBe(175_000);
  });

  it("excludes superseded commissions from payment total", async () => {
    const agent = await makeUser({ role: "AGENT" });
    const c1 = await seedCommission(agent._id.toString(), 100_000, "2026-04");
    await seedCommission(agent._id.toString(), 50_000, "2026-04");
    c1.supersededAt = new Date();
    await c1.save();
    const payment = await paymentService.createOrUpdateForUserPeriod({
      userId: agent._id.toString(),
      period: "2026-04",
    });
    expect(payment.totalAmountCents).toBe(50_000);
  });
});
