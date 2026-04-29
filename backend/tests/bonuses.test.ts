import { describe, expect, it } from "vitest";
import * as bonusService from "../src/modules/bonuses/bonus.service";
import * as commissionService from "../src/modules/commissions/commission.service";
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
  // Mirror the production flow: signing generates CONTRACT_SIGNED commissions.
  await commissionService.generateForContract(contract._id.toString());
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

  it("creates AGENT bonus = bonus% of agent's monthly commission", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    // Default: agentBp=1500 (15%), managerBp=500 (5%)
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    await makeBonusRule({ threshold: 2, basisPoints: 1000 }); // 10%
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
    // Agent commission per contract: 500k * 15% = 75k. Two contracts = 150k.
    // Bonus: 150k * 10% = 15k.
    expect(bonuses[0]?.baseAmountCents).toBe(150_000);
    expect(bonuses[0]?.bonusAmountCents).toBe(15_000);
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
    expect(r2.bonusesSkippedExisting).toBeGreaterThanOrEqual(1);
    expect(r3.bonusesCreated).toBe(0);

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

  it("network bonus = bonus% of MANAGER's monthly commission, threshold counts network activations", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent1 = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const agent2 = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    // Default version: agentBp=1500, managerBp=500
    await makeBonusRule({
      role: "AREA_MANAGER",
      conditionType: "NETWORK_INSTALLATIONS_GTE",
      threshold: 3,
      basisPoints: 500, // 5%
    });
    // 2 × 600k under agent1, 1 × 800k under agent2
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
    // Agent commissions per 600k contract: 600k*15% = 90k. Manager override: 90k*5% = 4500. ×2 = 9000.
    // Agent commission for 800k: 800k*15% = 120k. Manager override: 120k*5% = 6000.
    // Total manager commissions for activated contracts: 4500 + 4500 + 6000 = 15_000.
    // Bonus: 15_000 * 5% = 750.
    expect(bonuses[0]?.baseAmountCents).toBe(15_000);
    expect(bonuses[0]?.bonusAmountCents).toBe(750);
    expect(bonuses[0]?.qualifierCount).toBe(3);
  });
});

describe("bonus.service.recalcForPeriod", () => {
  it("supersedes prior bonus commissions and re-runs with current rules", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    const rule = await makeBonusRule({ threshold: 1, basisPoints: 1000 });
    await activatedContract({
      agentId: agent._id.toString(),
      managerId: am._id.toString(),
      amountCents: 500_000,
      versionId: version._id.toString(),
      activatedAt: new Date("2026-04-10"),
    });

    await bonusService.runForPeriod("2026-04");
    expect((await Bonus.find({ period: "2026-04" })).length).toBe(1);

    // Admin updates the rule to 20%
    rule.basisPoints = 2000;
    await rule.save();

    await bonusService.recalcForPeriod("2026-04");
    const bonuses = await Bonus.find({ period: "2026-04" });
    expect(bonuses).toHaveLength(1);
    // Agent commission = 75k; new bonus = 75k * 20% = 15k
    expect(bonuses[0]?.bonusAmountCents).toBe(15_000);

    // Old bonus commission row was superseded, not deleted
    const oldBonusCommissions = await Commission.find({
      sourceEvent: "BONUS_AGENT_INSTALLATIONS",
      supersededAt: { $ne: null },
    });
    expect(oldBonusCommissions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("bonus.service.previousPeriod", () => {
  it("returns previous calendar month", () => {
    expect(bonusService.previousPeriod(new Date("2026-04-15"))).toBe("2026-03");
    expect(bonusService.previousPeriod(new Date("2026-01-15"))).toBe("2025-12");
  });
});

describe("bonus run diagnostics", () => {
  it("reports BELOW_THRESHOLD with actual count and base", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({
      role: "AGENT",
      managerId: am._id.toString(),
      fullName: "Agent Below",
    });
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    await makeBonusRule({ threshold: 5, basisPoints: 1000 });
    await activatedContract({
      agentId: agent._id.toString(),
      managerId: am._id.toString(),
      amountCents: 1_000_000,
      versionId: version._id.toString(),
      activatedAt: new Date("2026-04-15"),
    });
    const summary = await bonusService.runForPeriod("2026-04");
    const outcome = summary.outcomes.find((o) => o.userId === agent._id.toString());
    expect(outcome?.status).toBe("BELOW_THRESHOLD");
    expect(outcome?.qualifierCount).toBe(1);
    expect(outcome?.baseAmountCents).toBe(150_000); // 1M * 15%
    expect(outcome?.threshold).toBe(5);
  });

  it("reports NO_ACTIVATIONS_IN_PERIOD when no installs activated", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    await makeSolutionWithVersion(admin._id.toString());
    await makeBonusRule({ threshold: 1, basisPoints: 1000 });
    void agent;
    void am;
    const summary = await bonusService.runForPeriod("2026-04");
    const outcome = summary.outcomes.find((o) => o.userId === agent._id.toString());
    expect(outcome?.status).toBe("NO_SIGNED_CONTRACTS");
  });

  it("reports CREATED with full math when bonus generated", async () => {
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
    const summary = await bonusService.runForPeriod("2026-04");
    const outcome = summary.outcomes.find((o) => o.userId === agent._id.toString());
    expect(outcome?.status).toBe("CREATED");
    expect(outcome?.bonusAmountCents).toBe(7_500); // 75k * 10%
  });
});
