import { describe, expect, it } from "vitest";
import * as planService from "../src/modules/catalog/installment-plan.service";
import * as contractService from "../src/modules/contracts/contract.service";
import { InstallmentPlan } from "../src/modules/catalog/installment-plan.model";
import {
  makeCustomer,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

describe("InstallmentPlan ↔ solution link + advance range (Review 1.1 §4)", () => {
  it("filters plans by solution; empty solutionIds = applies to all", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const { solution: solA } = await makeSolutionWithVersion(admin._id.toString());
    const { solution: solB } = await makeSolutionWithVersion(admin._id.toString());

    const planForA = await InstallmentPlan.create({
      name: "A only · 36mo",
      months: 36,
      solutionIds: [solA._id],
    });
    const planForAll = await InstallmentPlan.create({
      name: "Universal · 60mo",
      months: 60,
      solutionIds: [],
    });
    const planForB = await InstallmentPlan.create({
      name: "B only · 48mo",
      months: 48,
      solutionIds: [solB._id],
    });

    const filteredForA = await planService.list({ solutionId: solA._id.toString() });
    const namesA = filteredForA.map((p) => p.name);
    expect(namesA).toContain("A only · 36mo");
    expect(namesA).toContain("Universal · 60mo");
    expect(namesA).not.toContain("B only · 48mo");

    const filteredForB = await planService.list({ solutionId: solB._id.toString() });
    expect(filteredForB.map((p) => p.name).sort()).toEqual(
      ["B only · 48mo", "Universal · 60mo"].sort()
    );

    void planForAll;
    void planForA;
    void planForB;
  });

  it("rejects contract with advance below the plan's advanceMinCents", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const am = await makeUser({ role: "AREA_MANAGER" });
    const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
    const customer = await makeCustomer();
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    const plan = await InstallmentPlan.create({
      name: "30%-50% advance",
      months: 24,
      advanceMinCents: 300_000, // 3,000 EUR
      advanceMaxCents: 500_000, // 5,000 EUR
    });

    await expect(
      contractService.create({
        customerId: customer._id.toString(),
        agentId: agent._id.toString(),
        solutionVersionId: version._id.toString(),
        amountCents: 1_000_000, // 10,000 EUR
        paymentMethod: "ADVANCE_INSTALLMENTS",
        advanceCents: 100_000, // 1,000 EUR — below min
        installmentPlanId: plan._id.toString(),
      })
    ).rejects.toThrow(/advanceCents below the plan's min/);
  });

  it("rejects contract with advance above the plan's advanceMaxCents", async () => {
    const admin = await makeUser({ role: "ADMIN" });
    const agent = await makeUser({ role: "AGENT" });
    const customer = await makeCustomer();
    const { version } = await makeSolutionWithVersion(admin._id.toString());
    const plan = await InstallmentPlan.create({
      name: "Capped advance",
      months: 24,
      advanceMinCents: null,
      advanceMaxCents: 200_000,
    });
    await expect(
      contractService.create({
        customerId: customer._id.toString(),
        agentId: agent._id.toString(),
        solutionVersionId: version._id.toString(),
        amountCents: 1_000_000,
        paymentMethod: "ADVANCE_INSTALLMENTS",
        advanceCents: 500_000, // above max
        installmentPlanId: plan._id.toString(),
      })
    ).rejects.toThrow(/advanceCents above the plan's max/);
  });
});
