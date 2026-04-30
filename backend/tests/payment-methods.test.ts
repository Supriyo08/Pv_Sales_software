import { describe, expect, it } from "vitest";
import * as commissionService from "../src/modules/commissions/commission.service";
import { Contract } from "../src/modules/contracts/contract.model";
import { InstallmentPlan } from "../src/modules/catalog/installment-plan.model";
import {
  makeCustomer,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

async function setup(opts: {
  agentBp?: number;
  managerBp?: number;
  amountCents?: number;
  paymentMethod?: "ONE_TIME" | "ADVANCE_INSTALLMENTS" | "FULL_INSTALLMENTS";
  advanceCents?: number;
  installmentPlanId?: string;
} = {}) {
  const admin = await makeUser({ role: "ADMIN" });
  const am = await makeUser({ role: "AREA_MANAGER" });
  const agent = await makeUser({ role: "AGENT", managerId: am._id.toString() });
  const customer = await makeCustomer();
  const { version } = await makeSolutionWithVersion(admin._id.toString(), {
    agentBp: opts.agentBp ?? 1500,
    managerBp: opts.managerBp ?? 500,
  });
  const contract = await Contract.create({
    customerId: customer._id,
    agentId: agent._id,
    managerId: am._id,
    solutionVersionId: version._id,
    amountCents: opts.amountCents ?? 1_000_000,
    currency: "EUR",
    status: "SIGNED",
    signedAt: new Date(),
    paymentMethod: opts.paymentMethod ?? "ONE_TIME",
    advanceCents: opts.advanceCents ?? 0,
    installmentPlanId: opts.installmentPlanId ?? null,
  });
  return { admin, am, agent, customer, version, contract };
}

describe("commission base adjusted by payment method", () => {
  it("ONE_TIME uses full contract amount", async () => {
    const { contract, agent } = await setup({ paymentMethod: "ONE_TIME" });
    const created = await commissionService.generateForContract(contract._id.toString());
    const agentC = created.find((c) => c.beneficiaryUserId.toString() === agent._id.toString());
    // 1M * 15% = 150k
    expect(agentC?.amountCents).toBe(150_000);
  });

  it("ADVANCE_INSTALLMENTS uses full contract amount (still committed)", async () => {
    const plan = await InstallmentPlan.create({
      name: "36 months 5% surcharge",
      months: 36,
      surchargeBp: 500,
      active: true,
    });
    const { contract, agent } = await setup({
      paymentMethod: "ADVANCE_INSTALLMENTS",
      advanceCents: 200_000,
      installmentPlanId: plan._id.toString(),
    });
    const created = await commissionService.generateForContract(contract._id.toString());
    const agentC = created.find((c) => c.beneficiaryUserId.toString() === agent._id.toString());
    // 1M * 15% = 150k (advance doesn't change base)
    expect(agentC?.amountCents).toBe(150_000);
  });

  it("FULL_INSTALLMENTS reduces base by InstallmentPlan.surchargeBp", async () => {
    const plan = await InstallmentPlan.create({
      name: "60 months 8% surcharge",
      months: 60,
      surchargeBp: 800, // 8%
      active: true,
    });
    const { contract, agent } = await setup({
      paymentMethod: "FULL_INSTALLMENTS",
      installmentPlanId: plan._id.toString(),
    });
    const created = await commissionService.generateForContract(contract._id.toString());
    const agentC = created.find((c) => c.beneficiaryUserId.toString() === agent._id.toString());
    // base = 1M - (1M * 8%) = 920k
    // agent commission = 920k * 15% = 138k
    expect(agentC?.amountCents).toBe(138_000);
    expect(agentC?.metadata).toMatchObject({
      paymentMethod: "FULL_INSTALLMENTS",
      baseCents: 920_000,
      contractAmountCents: 1_000_000,
    });
  });

  it("FULL_INSTALLMENTS with 0% surcharge equals ONE_TIME math", async () => {
    const plan = await InstallmentPlan.create({
      name: "12 months no surcharge",
      months: 12,
      surchargeBp: 0,
      active: true,
    });
    const { contract } = await setup({
      paymentMethod: "FULL_INSTALLMENTS",
      installmentPlanId: plan._id.toString(),
    });
    const created = await commissionService.generateForContract(contract._id.toString());
    const total = created.reduce((acc, c) => acc + c.amountCents, 0);
    // agent 150k + manager (150k * 5%) = 7500 → 157500
    expect(total).toBe(157_500);
  });

  it("manager override is computed on the (already-adjusted) agent commission", async () => {
    const plan = await InstallmentPlan.create({
      name: "48 months 10%",
      months: 48,
      surchargeBp: 1000,
      active: true,
    });
    const { contract, am } = await setup({
      paymentMethod: "FULL_INSTALLMENTS",
      installmentPlanId: plan._id.toString(),
    });
    const created = await commissionService.generateForContract(contract._id.toString());
    const mgrC = created.find((c) => c.beneficiaryUserId.toString() === am._id.toString());
    // base = 1M * 0.9 = 900k
    // agent commission = 900k * 15% = 135k
    // manager override = 135k * 5% = 6750
    expect(mgrC?.amountCents).toBe(6_750);
  });
});
