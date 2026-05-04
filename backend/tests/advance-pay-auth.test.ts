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

describe("AdvancePayAuthorization (Review 1.1 §8 + Review 1.2 two-stage)", () => {
  it("ensureForContract is idempotent — re-approving doesn't duplicate the record", async () => {
    const { contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    const again = await authService.ensureForContract(contract._id.toString());
    expect(again._id.toString()).toBe(a._id.toString());
    expect(a.status).toBe("PENDING_MANAGER");
  });

  it("manager APPROVED escalates to PENDING_ADMIN — commissions do NOT fire yet", async () => {
    const { am, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    expect(
      await Commission.countDocuments({ contractId: contract._id })
    ).toBe(0);
    const after = await authService.decideManager(
      a._id.toString(),
      "APPROVED",
      am._id.toString(),
      "ok with me"
    );
    expect(after.status).toBe("PENDING_ADMIN");
    expect(
      await Commission.countDocuments({
        contractId: contract._id,
        supersededAt: null,
      })
    ).toBe(0);
  });

  it("manager DECLINED is terminal and does NOT escalate to admin", async () => {
    const { am, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    const after = await authService.decideManager(
      a._id.toString(),
      "DECLINED",
      am._id.toString(),
      "wait for install"
    );
    expect(after.status).toBe("DECLINED_BY_MANAGER");
    expect(
      await Commission.countDocuments({ contractId: contract._id })
    ).toBe(0);

    // Admin trying to decide on a manager-declined request must fail.
    await expect(
      authService.decideAdmin(
        a._id.toString(),
        "APPROVED",
        am._id.toString(),
        "override"
      )
    ).rejects.toThrow(/awaiting admin/);

    // Install activation falls back through resolveByInstallActivation.
    await authService.resolveByInstallActivation(contract._id.toString());
    expect(
      await Commission.countDocuments({
        contractId: contract._id,
        supersededAt: null,
      })
    ).toBeGreaterThan(0);
  });

  it("both manager AND admin must APPROVE before commissions fire", async () => {
    const { admin, am, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    await authService.decideManager(
      a._id.toString(),
      "APPROVED",
      am._id.toString(),
      ""
    );
    expect(
      await Commission.countDocuments({ contractId: contract._id })
    ).toBe(0);
    const after = await authService.decideAdmin(
      a._id.toString(),
      "APPROVED",
      admin._id.toString(),
      "final sign-off"
    );
    expect(after.status).toBe("AUTHORIZED");
    expect(
      await Commission.countDocuments({
        contractId: contract._id,
        supersededAt: null,
      })
    ).toBeGreaterThan(0);
  });

  it("admin DECLINED defers commission to install activation (idempotent)", async () => {
    const { admin, am, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    await authService.decideManager(
      a._id.toString(),
      "APPROVED",
      am._id.toString(),
      ""
    );
    const after = await authService.decideAdmin(
      a._id.toString(),
      "DECLINED",
      admin._id.toString(),
      "too risky"
    );
    expect(after.status).toBe("DECLINED_BY_ADMIN");
    expect(
      await Commission.countDocuments({ contractId: contract._id })
    ).toBe(0);

    await authService.resolveByInstallActivation(contract._id.toString());
    const firstCount = await Commission.countDocuments({
      contractId: contract._id,
    });
    expect(firstCount).toBeGreaterThan(0);
    // Re-trigger should be a no-op (idempotent).
    await authService.resolveByInstallActivation(contract._id.toString());
    expect(
      await Commission.countDocuments({ contractId: contract._id })
    ).toBe(firstCount);
    void commissionService;
  });
});

describe("commissionBreakdownForUser (Review 1.2)", () => {
  it("buckets a fully-AUTHORIZED contract into paidEarly", async () => {
    const { admin, am, agent, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    await authService.decideManager(
      a._id.toString(),
      "APPROVED",
      am._id.toString(),
      ""
    );
    await authService.decideAdmin(
      a._id.toString(),
      "APPROVED",
      admin._id.toString(),
      ""
    );
    const breakdown = await commissionService.commissionBreakdownForUser(
      agent._id.toString()
    );
    expect(breakdown.paidEarlyCents).toBeGreaterThan(0);
    expect(breakdown.deferredCents).toBe(0);
    expect(breakdown.pendingEarlyCents).toBe(0);
  });

  it("buckets a PENDING_MANAGER contract into pendingEarly", async () => {
    const { agent, contract } = await makeApprovedContract();
    await authService.ensureForContract(contract._id.toString());
    const breakdown = await commissionService.commissionBreakdownForUser(
      agent._id.toString()
    );
    expect(breakdown.pendingEarlyCents).toBeGreaterThan(0);
    expect(breakdown.paidEarlyCents).toBe(0);
    expect(breakdown.totalPotentialCents).toBe(breakdown.pendingEarlyCents);
  });

  it("buckets a manager-DECLINED contract into deferred", async () => {
    const { am, agent, contract } = await makeApprovedContract();
    const a = await authService.ensureForContract(contract._id.toString());
    await authService.decideManager(
      a._id.toString(),
      "DECLINED",
      am._id.toString(),
      ""
    );
    const breakdown = await commissionService.commissionBreakdownForUser(
      agent._id.toString()
    );
    expect(breakdown.deferredCents).toBeGreaterThan(0);
    expect(breakdown.pendingEarlyCents).toBe(0);
    expect(breakdown.paidEarlyCents).toBe(0);
  });
});
