import { describe, expect, it } from "vitest";
import * as commissionService from "../src/modules/commissions/commission.service";
import { Contract } from "../src/modules/contracts/contract.model";
import { Customer } from "../src/modules/customers/customer.model";
import * as customerService from "../src/modules/customers/customer.service";
import {
  makeCustomer,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

async function setup() {
  const admin = await makeUser({ role: "ADMIN" });
  const am1 = await makeUser({ role: "AREA_MANAGER" });
  const am2 = await makeUser({ role: "AREA_MANAGER" });
  const agentA = await makeUser({ role: "AGENT", managerId: am1._id.toString() });
  const agentB = await makeUser({ role: "AGENT", managerId: am2._id.toString() });
  const customer = await makeCustomer();
  const { version } = await makeSolutionWithVersion(admin._id.toString(), {
    agentBp: 2000, // 20%
    managerBp: 500, // 5% of agent comm
  });
  return { admin, am1, am2, agentA, agentB, customer, version };
}

describe("Customer commission split (Review 1.1 §6)", () => {
  it("splits agent commission across multiple agents per bp share", async () => {
    const { admin, am1, am2, agentA, agentB, customer, version } = await setup();

    // 60/40 split between agentA and agentB
    await Customer.updateOne(
      { _id: customer._id },
      {
        commissionSplit: {
          agentSplits: [
            { userId: agentA._id, bp: 6000 },
            { userId: agentB._id, bp: 4000 },
          ],
          managerOverrideBeneficiaryId: am1._id,
        },
      }
    );

    const contract = await Contract.create({
      customerId: customer._id,
      agentId: agentA._id,
      managerId: am1._id,
      solutionVersionId: version._id,
      amountCents: 1_000_000, // 10,000 EUR
      currency: "EUR",
      status: "SIGNED",
      signedAt: new Date(),
    });

    const created = await commissionService.generateForContract(
      contract._id.toString()
    );

    // Total agent commission = 1,000,000 * 20% = 200,000 cents
    // Split 60/40 = 120,000 + 80,000
    const agentACommission = created.find(
      (c) => c.beneficiaryUserId.toString() === agentA._id.toString()
    );
    const agentBCommission = created.find(
      (c) => c.beneficiaryUserId.toString() === agentB._id.toString()
    );
    expect(agentACommission?.amountCents).toBe(120_000);
    expect(agentBCommission?.amountCents).toBe(80_000);

    // Manager override = total agent comm (200,000) * 5% = 10,000
    // Goes to am1 (override beneficiary)
    const managerCommission = created.find(
      (c) => c.beneficiaryRole === "AREA_MANAGER"
    );
    expect(managerCommission?.beneficiaryUserId.toString()).toBe(am1._id.toString());
    expect(managerCommission?.amountCents).toBe(10_000);
    void am2;
  });

  it("falls back to single-agent flow when no split configured", async () => {
    const { admin, am1, agentA, customer, version } = await setup();
    const contract = await Contract.create({
      customerId: customer._id,
      agentId: agentA._id,
      managerId: am1._id,
      solutionVersionId: version._id,
      amountCents: 500_000,
      currency: "EUR",
      status: "SIGNED",
      signedAt: new Date(),
    });
    const created = await commissionService.generateForContract(
      contract._id.toString()
    );
    const agentRows = created.filter((c) => c.beneficiaryRole === "AGENT");
    expect(agentRows).toHaveLength(1);
    expect(agentRows[0]!.beneficiaryUserId.toString()).toBe(agentA._id.toString());
    expect(agentRows[0]!.amountCents).toBe(100_000); // 20% of 500k
    void admin;
  });

  it("rejects splits whose bp don't sum to 10000", async () => {
    const { admin, agentA, agentB, customer } = await setup();
    const scope = {
      isAdmin: true,
      selfId: admin._id.toString(),
      role: "ADMIN" as const,
      agentIds: [],
      managerIds: [],
    };
    await expect(
      customerService.reassign(customer._id.toString(), agentA._id.toString(), scope, {
        agentSplits: [
          { userId: agentA._id.toString(), bp: 6000 },
          { userId: agentB._id.toString(), bp: 3000 }, // sum = 9000, not 10000
        ],
      })
    ).rejects.toThrow(/sum to 10000/);
  });

  it("derives manager from primary agent when split has no override", async () => {
    const { admin, am1, agentA, agentB, customer, version } = await setup();
    await Customer.updateOne(
      { _id: customer._id },
      {
        commissionSplit: {
          agentSplits: [
            { userId: agentA._id, bp: 7000 },
            { userId: agentB._id, bp: 3000 },
          ],
        },
      }
    );
    const contract = await Contract.create({
      customerId: customer._id,
      agentId: agentA._id,
      managerId: null, // no contract manager — derive from primary agent
      solutionVersionId: version._id,
      amountCents: 1_000_000,
      currency: "EUR",
      status: "SIGNED",
      signedAt: new Date(),
    });
    const created = await commissionService.generateForContract(
      contract._id.toString()
    );
    const managerCommission = created.find((c) => c.beneficiaryRole === "AREA_MANAGER");
    // Primary agent (agentA) has manager am1 → override goes there
    expect(managerCommission?.beneficiaryUserId.toString()).toBe(am1._id.toString());
    void admin;
  });
});
