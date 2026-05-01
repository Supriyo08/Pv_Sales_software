import { describe, expect, it } from "vitest";
import * as contractService from "../src/modules/contracts/contract.service";
import * as templateService from "../src/modules/templates/template.service";
import { Contract } from "../src/modules/contracts/contract.model";
import { ContractTemplate } from "../src/modules/templates/template.model";
import {
  makeCustomer,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

async function makeDraftContract() {
  const admin = await makeUser({ role: "ADMIN" });
  const agent = await makeUser({ role: "AGENT" });
  const customer = await makeCustomer();
  const { version } = await makeSolutionWithVersion(admin._id.toString());
  const contract = await contractService.create({
    customerId: customer._id.toString(),
    agentId: agent._id.toString(),
    solutionVersionId: version._id.toString(),
    amountCents: 1_000_000,
  });
  return { admin, agent, customer, version, contract };
}

async function makeTemplate(adminId: string) {
  return ContractTemplate.create({
    name: "Test template",
    body: "Hello @customer_name. Amount: @amount.",
    active: true,
    createdBy: adminId,
  });
}

describe("Contract generation + approval gate (Review 1.1 §1)", () => {
  it("generates a PDF document and stores it on the contract", async () => {
    const { admin, agent, contract } = await makeDraftContract();
    const tpl = await makeTemplate(admin._id.toString());
    const result = await contractService.generate(contract._id.toString(), {
      templateId: tpl._id.toString(),
      values: { customer_name: "Mario", amount: "10,000 EUR" },
      generatedBy: agent._id.toString(),
    });
    expect(result.document.kind).toBe("CONTRACT_DRAFT");
    expect(result.document.mimeType).toBe("application/pdf");
    const refreshed = await Contract.findById(contract._id);
    expect(refreshed?.generatedDocumentId?.toString()).toBe(result.document._id.toString());
    expect(refreshed?.generationApprovedAt).toBeNull();
    void templateService;
  });

  it("blocks sign() while generation is pending approval", async () => {
    const { admin, agent, contract } = await makeDraftContract();
    const tpl = await makeTemplate(admin._id.toString());
    await contractService.generate(contract._id.toString(), {
      templateId: tpl._id.toString(),
      values: {},
      generatedBy: agent._id.toString(),
    });
    await expect(contractService.sign(contract._id.toString())).rejects.toThrow(
      /awaiting admin approval/
    );
  });

  it("permits sign() after admin approves the generated PDF", async () => {
    const { admin, agent, contract } = await makeDraftContract();
    const tpl = await makeTemplate(admin._id.toString());
    await contractService.generate(contract._id.toString(), {
      templateId: tpl._id.toString(),
      values: {},
      generatedBy: agent._id.toString(),
    });
    await contractService.approveGenerated(
      contract._id.toString(),
      admin._id.toString()
    );
    const signed = await contractService.sign(contract._id.toString());
    expect(signed.status).toBe("SIGNED");
  });
});
