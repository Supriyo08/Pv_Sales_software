import { describe, expect, it } from "vitest";
import * as editService from "../src/modules/contract-edit-requests/contract-edit-request.service";
import * as contractService from "../src/modules/contracts/contract.service";
import { Contract } from "../src/modules/contracts/contract.model";
import {
  makeCustomer,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

async function makeBaseContract() {
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
    paymentMethod: "ONE_TIME",
  });
  return { admin, am, agent, customer, version, contract };
}

describe("Contract edit requests (Review 1.1 §1)", () => {
  it("creates a request and approves it — applies whitelisted changes", async () => {
    const { admin, agent, contract } = await makeBaseContract();
    const er = await editService.create({
      contractId: contract._id.toString(),
      requestedBy: agent._id.toString(),
      changes: { amountCents: 1_500_000 },
      reason: "Customer asked for bigger system",
    });
    expect(er.status).toBe("PENDING");

    await editService.approve(er._id.toString(), admin._id.toString(), "ok");

    const updated = await Contract.findById(contract._id);
    expect(updated?.amountCents).toBe(1_500_000);
  });

  it("rejected requests don't mutate the contract", async () => {
    const { admin, agent, contract } = await makeBaseContract();
    const before = contract.amountCents;
    const er = await editService.create({
      contractId: contract._id.toString(),
      requestedBy: agent._id.toString(),
      changes: { amountCents: 999_999 },
    });
    await editService.reject(er._id.toString(), admin._id.toString(), "no thanks");

    const after = await Contract.findById(contract._id);
    expect(after?.amountCents).toBe(before);
  });

  it("strips non-whitelisted fields from changes", async () => {
    const { agent, contract } = await makeBaseContract();
    const er = await editService.create({
      contractId: contract._id.toString(),
      requestedBy: agent._id.toString(),
      // status + cancellationReason are not whitelisted; should be dropped
      changes: {
        amountCents: 1_200_000,
        status: "CANCELLED",
        cancellationReason: "trying to bypass",
      },
    });
    expect(Object.keys(er.changes as Record<string, unknown>)).toEqual(["amountCents"]);
  });

  it("rejects edits on cancelled contracts", async () => {
    const { agent, contract } = await makeBaseContract();
    await contractService.cancel(contract._id.toString(), "voided");
    await expect(
      editService.create({
        contractId: contract._id.toString(),
        requestedBy: agent._id.toString(),
        changes: { amountCents: 100_000 },
      })
    ).rejects.toThrow(/cancelled/);
  });
});
