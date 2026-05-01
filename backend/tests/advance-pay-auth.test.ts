import { describe, expect, it } from "vitest";
import * as authService from "../src/modules/advance-pay-authorizations/advance-pay-auth.service";
import * as commissionService from "../src/modules/commissions/commission.service";
import { Commission } from "../src/modules/commissions/commission.model";
import { Contract } from "../src/modules/contracts/contract.model";
import {
  makeCustomer,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

async function makeApprovedContract() {
  const admin = await makeUser({ role: "ADMIN" });
  const am = await makeUser({ role: "AREA_MANAGER" });
  const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
  const customer = await makeCustomer();
  const { version } = await makeSolutionWithVersion(admin._id.toString());
  const contract = await Contract.create({
    customerId: customer._id,
    agentId: agent._id,
    managerId: am._id,
    solutionVersionId: version._id,
    amountCents: 1_000_000,
    currency: "EUR",
    status: "SIGNED",
    signedAt: new Date(),
    approvalRequired: true,
    approvedAt: new Date(),
    approvedBy: admin._id,
    paymentMethod: "ONE_TIME",
  });
  return { admin, am, agent, customer, version, contract };
}

describe("AdvancePayAuthorization (Review 1.1 §8)", () => {
  it("ensureForContract is idempotent — re-approving doesn't duplicate the record", async () => {
    const { contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    const again = await authService.ensureForContract(contract._id.toString());
    expect(again._id.toString()).toBe(a._id.toString());
    expect(a.status).toBe("PENDING");
  });

  it("AUTHORIZED decision triggers commission generation immediately", async () => {
    const { am, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    expect(
      await Commission.countDocuments({ contractId: contract._id })
    ).toBe(0);
    await authService.decide(
      a._id.toString(),
      "AUTHORIZED",
      am._id.toString(),
      "I take responsibility"
    );
    const after = await Commission.countDocuments({
      contractId: contract._id,
      supersededAt: null,
    });
    expect(after).toBeGreaterThan(0);
  });

  it("DECLINED decision does NOT auto-generate commissions; install activation does", async () => {
    const { am, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    await authService.decide(
      a._id.toString(),
      "DECLINED",
      am._id.toString(),
      "wait for install"
    );
    expect(
      await Commission.countDocuments({ contractId: contract._id })
    ).toBe(0);

    // Install activation falls back through service.resolveByInstallActivation
    await authService.resolveByInstallActivation(contract._id.toString());
    expect(
      await Commission.countDocuments({
        contractId: contract._id,
        supersededAt: null,
      })
    ).toBeGreaterThan(0);
    void commissionService;
  });

  it("idempotent commission generation — won't duplicate on re-trigger", async () => {
    const { am, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    await authService.decide(
      a._id.toString(),
      "AUTHORIZED",
      am._id.toString(),
      ""
    );
    const firstCount = await Commission.countDocuments({
      contractId: contract._id,
    });
    // Trigger the install fallback — should be a no-op since commissions exist.
    await authService.resolveByInstallActivation(contract._id.toString());
    const secondCount = await Commission.countDocuments({
      contractId: contract._id,
    });
    expect(secondCount).toBe(firstCount);
  });
});
