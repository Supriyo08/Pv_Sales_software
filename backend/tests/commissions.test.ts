import { describe, expect, it } from "vitest";
import * as commissionService from "../src/modules/commissions/commission.service";
import { Commission } from "../src/modules/commissions/commission.model";
import { SolutionVersion } from "../src/modules/catalog/solution-version.model";
import {
  makeCustomer,
  makeSignedContract,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

async function setup(overrides: { agentBp?: number; managerBp?: number; amountCents?: number } = {}) {
  const admin = await makeUser({ role: "ADMIN" });
  const am = await makeUser({ role: "AREA_MANAGER" });
  const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
  const customer = await makeCustomer();
  const { version } = await makeSolutionWithVersion(admin._id.toString(), {
    agentBp: overrides.agentBp ?? 1500,
    managerBp: overrides.managerBp ?? 500,
  });
  const contract = await makeSignedContract({
    customerId: customer._id.toString(),
    agentId: agent._id.toString(),
    managerId: am._id.toString(),
    solutionVersionId: version._id.toString(),
    amountCents: overrides.amountCents ?? 1_200_000,
  });
  return { admin, am, agent, customer, version, contract };
}

describe("commission.service", () => {
  it("generates agent commission % of contract; manager commission % of agent commission", async () => {
    const { contract, agent, am } = await setup();
    const created = await commissionService.generateForContract(contract._id.toString());
    expect(created).toHaveLength(2);

    const agentC = created.find((c) => c.beneficiaryUserId.toString() === agent._id.toString());
    const mgrC = created.find((c) => c.beneficiaryUserId.toString() === am._id.toString());

    // Agent: 1.2M * 15% = 180k
    expect(agentC?.amountCents).toBe(180_000);
    // Manager OVERRIDE on agent commission: 180k * 5% = 9k (additive, not deducted from agent)
    expect(mgrC?.amountCents).toBe(9_000);
    expect(agentC?.sourceEvent).toBe("CONTRACT_SIGNED");
    expect(mgrC?.metadata).toMatchObject({
      baseKind: "AGENT_COMMISSION",
      baseCents: 180_000,
    });
  });

  it("stamps period derived from signedAt", async () => {
    const { contract } = await setup();
    const [agentC] = await commissionService.generateForContract(contract._id.toString());
    expect(agentC?.period).toBe(
      `${contract.signedAt!.getUTCFullYear()}-${String(contract.signedAt!.getUTCMonth() + 1).padStart(2, "0")}`
    );
  });

  it("skips manager when agent commission is zero", async () => {
    const { contract } = await setup({ agentBp: 0, managerBp: 500 });
    const created = await commissionService.generateForContract(contract._id.toString());
    expect(created).toHaveLength(0);
  });

  it("skips zero-bp manager", async () => {
    const { contract } = await setup({ managerBp: 0 });
    const created = await commissionService.generateForContract(contract._id.toString());
    expect(created).toHaveLength(1);
    expect(created[0]?.beneficiaryRole).toBe("AGENT");
  });

  it("supersedeForContract marks all active rows superseded", async () => {
    const { contract } = await setup();
    await commissionService.generateForContract(contract._id.toString());
    const supersededCount = await commissionService.supersedeForContract(
      contract._id.toString(),
      "test cancel"
    );
    expect(supersededCount).toBe(2);
    const active = await Commission.find({ contractId: contract._id, supersededAt: null });
    expect(active).toHaveLength(0);
  });

  it("recalculate creates new rows + supersedes old, never UPDATEs amount", async () => {
    const { contract, version } = await setup();
    const original = await commissionService.generateForContract(contract._id.toString());
    const originalIds = original.map((c) => c._id.toString());
    const originalAmounts = original.map((c) => c.amountCents);

    // Change pricing on the version (simulating retroactive correction)
    version.agentBp = 2000;
    version.managerBp = 1000;
    await version.save();

    const fresh = await commissionService.recalculateForContract(
      contract._id.toString(),
      "retroactive correction"
    );
    expect(fresh).toHaveLength(2);
    expect(fresh.map((c) => c._id.toString()).sort()).not.toEqual(originalIds.sort());

    // Originals: immutable amounts, but superseded
    const allOriginal = await Commission.find({ _id: { $in: originalIds } });
    expect(allOriginal).toHaveLength(2);
    expect(allOriginal.every((c) => c.supersededAt !== null)).toBe(true);
    expect(allOriginal.map((c) => c.amountCents).sort()).toEqual(originalAmounts.sort());

    // New: agent = 1.2M * 20% = 240k; manager OVERRIDE = 240k * 10% = 24k
    expect(fresh.find((c) => c.amountCents === 240_000)).toBeTruthy();
    expect(fresh.find((c) => c.amountCents === 24_000)).toBeTruthy();
  });

  it("totalEarnedCents sums only active commissions", async () => {
    const { contract, agent } = await setup();
    await commissionService.generateForContract(contract._id.toString());
    expect(await commissionService.totalEarnedCents(agent._id.toString())).toBe(180_000);
    await commissionService.supersedeForContract(contract._id.toString(), "test");
    expect(await commissionService.totalEarnedCents(agent._id.toString())).toBe(0);
  });
});

describe("commission immutability", () => {
  it("never overwrites amountCents on existing rows", async () => {
    const { contract } = await setup();
    const [first] = await commissionService.generateForContract(contract._id.toString());
    const originalAmount = first!.amountCents;

    await commissionService.recalculateForContract(contract._id.toString(), "test");

    const refetched = await Commission.findById(first!._id);
    expect(refetched?.amountCents).toBe(originalAmount);
  });
});

describe("solution version immutability across contracts", () => {
  it("contract retains its solutionVersionId snapshot", async () => {
    const { contract, version } = await setup();
    expect(contract.solutionVersionId.toString()).toBe(version._id.toString());

    // Change version pricing — contract still references the same version
    version.agentBp = 9999;
    await version.save();

    const refetched = await SolutionVersion.findById(contract.solutionVersionId);
    expect(refetched?._id.toString()).toBe(version._id.toString());
  });
});
