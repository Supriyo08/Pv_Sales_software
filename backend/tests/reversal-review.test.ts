import { describe, expect, it } from "vitest";
import * as reversalService from "../src/modules/reversal-reviews/reversal-review.service";
import * as commissionService from "../src/modules/commissions/commission.service";
import * as installationService from "../src/modules/installations/installation.service";
import { Installation } from "../src/modules/installations/installation.model";
import { Commission } from "../src/modules/commissions/commission.model";
import { Contract } from "../src/modules/contracts/contract.model";
import { ReversalReview } from "../src/modules/reversal-reviews/reversal-review.model";
import {
  makeCustomer,
  makeSolutionWithVersion,
  makeUser,
} from "./factories";

async function setupCancelledInstallScenario() {
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
  // Install + activate, then cancel.
  const inst = await Installation.create({
    contractId: contract._id,
    status: "ACTIVATED",
    activatedAt: new Date(),
    milestones: [{ status: "ACTIVATED", date: new Date(), notes: "" }],
  });
  // Generate commission for the contract — what reversal should target.
  await commissionService.generateForContract(contract._id.toString());
  return { admin, am, agent, customer, contract, inst };
}

describe("Reversal review queue (Review 1.1 §7)", () => {
  it("creates a review per active commission when the install is cancelled", async () => {
    const { inst } = await setupCancelledInstallScenario();
    await installationService.cancel(inst._id.toString(), "subsidy denied");

    const created = await reversalService.createForInstallation(inst._id.toString());
    expect(created).toBeGreaterThan(0);

    const reviews = await ReversalReview.find({ installationId: inst._id });
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((r) => r.status === "PENDING")).toBe(true);
  });

  it("REVERT supersedes the commission", async () => {
    const { admin, inst, contract } = await setupCancelledInstallScenario();
    await installationService.cancel(inst._id.toString(), "subsidy denied");
    await reversalService.createForInstallation(inst._id.toString());

    const review = await ReversalReview.findOne({
      installationId: inst._id,
      kind: "COMMISSION",
    });
    expect(review).toBeTruthy();

    await reversalService.decide(
      review!._id.toString(),
      "REVERT",
      null,
      admin._id.toString(),
      "ok"
    );

    const original = await Commission.findById(review!.subjectId);
    expect(original?.supersededAt).toBeTruthy();
    void contract;
  });

  it("KEEP marks the review reviewed without superseding the commission", async () => {
    const { admin, inst } = await setupCancelledInstallScenario();
    await installationService.cancel(inst._id.toString(), "later");
    await reversalService.createForInstallation(inst._id.toString());

    const review = await ReversalReview.findOne({
      installationId: inst._id,
      kind: "COMMISSION",
    });
    await reversalService.decide(
      review!._id.toString(),
      "KEEP",
      null,
      admin._id.toString(),
      "AM authorized advance — keep it"
    );

    const updated = await ReversalReview.findById(review!._id);
    expect(updated?.status).toBe("DECIDED");
    expect(updated?.decision).toBe("KEEP");
    const original = await Commission.findById(review!.subjectId);
    expect(original?.supersededAt).toBeNull();
  });

  it("REDUCE supersedes the original and creates a smaller commission row", async () => {
    const { admin, inst } = await setupCancelledInstallScenario();
    await installationService.cancel(inst._id.toString(), "partial fault");
    await reversalService.createForInstallation(inst._id.toString());

    const review = await ReversalReview.findOne({
      installationId: inst._id,
      kind: "COMMISSION",
    });
    const original = await Commission.findById(review!.subjectId);
    const halfCents = Math.floor(original!.amountCents / 2);

    await reversalService.decide(
      review!._id.toString(),
      "REDUCE",
      halfCents,
      admin._id.toString(),
      "half on agent"
    );

    const supersededOriginal = await Commission.findById(original!._id);
    expect(supersededOriginal?.supersededAt).toBeTruthy();

    const replacement = await Commission.findOne({
      contractId: original!.contractId,
      beneficiaryUserId: original!.beneficiaryUserId,
      supersededAt: null,
      amountCents: halfCents,
    });
    expect(replacement).toBeTruthy();
  });
});
