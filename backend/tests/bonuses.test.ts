import { describe, expect, it } from "vitest";
import * as bonusService from "../src/modules/bonuses/bonus.service";
import { Bonus } from "../src/modules/bonuses/bonus.model";
import { Commission } from "../src/modules/commissions/commission.model";
import { Installation } from "../src/modules/installations/installation.model";
import {
  makeBonusRule,
  makeCustomer,
  makeSignedContract,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

async function activatedContract(opts: {
  agentId: string;
  managerId: string;
  amountCents: number;
  versionId: string;
  activatedAt: Date;
}) {
  const cust = await makeCustomer();
  const contract = await makeSignedContract({
    customerId: cust._id.toString(),
    agentId: opts.agentId,
    managerId: opts.managerId,
    solutionVersionId: opts.versionId,
    amountCents: opts.amountCents,
  });
  await Installation.create({
    contractId: contract._id,
    status: "ACTIVATED",
    activatedAt: opts.activatedAt,
    milestones: [{ status: "ACTIVATED", date: opts.activatedAt, notes: "" }],
  });
  return contract;
}

describe("bonus.service.runForPeriod", () => {
  it("does nothing when threshold not met", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    await makeBonusRule({ threshold: 5 });
    await activatedContract({
      agentId: agent._id.toString(),
      managerId: am._id.toString(),
      amountCents: 1_000_000,
      versionId: version._id.toString(),
      activatedAt: new Date("2026-04-15"),
    });
    const summary = await bonusService.runForPeriod("2026-04");
    expect(summary.bonusesCreated).toBe(0);
  });

  it("creates AGENT bonus when threshold met", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    await makeBonusRule({ threshold: 2, basisPoints: 1000 });
    for (let i = 0; i < 2; i++) {
      await activatedContract({
        agentId: agent._id.toString(),
        managerId: am._id.toString(),
        amountCents: 500_000,
        versionId: version._id.toString(),
        activatedAt: new Date("2026-04-10"),
      });
    }
    const summary = await bonusService.runForPeriod("2026-04");
    expect(summary.bonusesCreated).toBe(1);

    const bonuses = await Bonus.find({ userId: agent._id });
    expect(bonuses).toHaveLength(1);
    // base = 1,000,000c, bp = 1000 → bonus = 100,000c
    expect(bonuses[0]?.bonusAmountCents).toBe(100_000);
    expect(bonuses[0]?.qualifierCount).toBe(2);
  });

  it("is idempotent on re-run for same period", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    await makeBonusRule({ threshold: 1, basisPoints: 1000 });
    await activatedContract({
      agentId: agent._id.toString(),
      managerId: am._id.toString(),
      amountCents: 500_000,
      versionId: version._id.toString(),
      activatedAt: new Date("2026-04-10"),
    });

    const r1 = await bonusService.runForPeriod("2026-04");
    const r2 = await bonusService.runForPeriod("2026-04");
    const r3 = await bonusService.runForPeriod("2026-04");

    expect(r1.bonusesCreated).toBe(1);
    expect(r2.bonusesCreated).toBe(0);
    expect(r2.bonusesSkipped).toBeGreaterThanOrEqual(1);
    expect(r3.bonusesCreated).toBe(0);

    // Only one bonus + one commission row per (user, period, rule)
    expect(await Bonus.countDocuments({ userId: agent._id })).toBe(1);
    expect(
      await Commission.countDocuments({
        beneficiaryUserId: agent._id,
        sourceEvent: "BONUS_AGENT_INSTALLATIONS",
      })
    ).toBe(1);
  });

  it("only counts activations within the period", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    await makeBonusRule({ threshold: 2, basisPoints: 1000 });
    // 1 in March, 1 in April → April should NOT qualify (only 1 in period)
    await activatedContract({
      agentId: agent._id.toString(),
      managerId: am._id.toString(),
      amountCents: 500_000,
      versionId: version._id.toString(),
      activatedAt: new Date("2026-03-15"),
    });
    await activatedContract({
      agentId: agent._id.toString(),
      managerId: am._id.toString(),
      amountCents: 500_000,
      versionId: version._id.toString(),
      activatedAt: new Date("2026-04-10"),
    });
    const r = await bonusService.runForPeriod("2026-04");
    expect(r.bonusesCreated).toBe(0);
  });

  it("network bonus aggregates across an area manager's agents", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent1 = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const agent2 = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    await makeBonusRule({
      role: "AREA_MANAGER",
      conditionType: "NETWORK_INSTALLATIONS_GTE",
      threshold: 3,
      basisPoints: 500,
    });
    // 2 contracts under agent1, 1 under agent2 = 3 total network installations
    for (let i = 0; i < 2; i++) {
      await activatedContract({
        agentId: agent1._id.toString(),
        managerId: am._id.toString(),
        amountCents: 600_000,
        versionId: version._id.toString(),
        activatedAt: new Date("2026-04-12"),
      });
    }
    await activatedContract({
      agentId: agent2._id.toString(),
      managerId: am._id.toString(),
      amountCents: 800_000,
      versionId: version._id.toString(),
      activatedAt: new Date("2026-04-20"),
    });

    const summary = await bonusService.runForPeriod("2026-04");
    expect(summary.bonusesCreated).toBe(1);

    const bonuses = await Bonus.find({ userId: am._id });
    expect(bonuses).toHaveLength(1);
    // base = 600k + 600k + 800k = 2M; bp = 500 → 100k bonus
    expect(bonuses[0]?.baseAmountCents).toBe(2_000_000);
    expect(bonuses[0]?.bonusAmountCents).toBe(100_000);
    expect(bonuses[0]?.qualifierCount).toBe(3);
  });
});

describe("bonus.service.previousPeriod", () => {
  it("returns previous calendar month", () => {
    expect(bonusService.previousPeriod(new Date("2026-04-15"))).toBe("2026-03");
    expect(bonusService.previousPeriod(new Date("2026-01-15"))).toBe("2025-12");
  });
});
