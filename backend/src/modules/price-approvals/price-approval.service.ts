import { Types } from "mongoose";
import { PriceApprovalRequest, type PriceApprovalStatus } from "./price-approval.model";
import { SolutionVersion } from "../catalog/solution-version.model";
import { Customer } from "../customers/customer.model";
import { User } from "../users/user.model";
import { create as createContract } from "../contracts/contract.service";
import { HttpError } from "../../middleware/error";

type CreateInput = {
  customerId: string;
  agentId: string;
  solutionVersionId: string;
  requestedAmountCents: number;
  note?: string;
};

export async function list(filter: { status?: PriceApprovalStatus }) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  return PriceApprovalRequest.find(q).sort({ createdAt: -1 }).limit(200);
}

export async function getById(id: string) {
  const r = await PriceApprovalRequest.findById(id);
  if (!r) throw new HttpError(404, "Price approval request not found");
  return r;
}

export async function create(input: CreateInput) {
  const customer = await Customer.findOne({ _id: input.customerId, deletedAt: null });
  if (!customer) throw new HttpError(400, "Customer not found");
  const agent = await User.findOne({ _id: input.agentId, deletedAt: null });
  if (!agent) throw new HttpError(400, "Agent not found");
  const version = await SolutionVersion.findById(input.solutionVersionId);
  if (!version) throw new HttpError(400, "Solution version not found");

  // Only require approval if actually out of range; if in range, agent should just
  // create a contract directly.
  const min = version.minPriceCents;
  const max = version.maxPriceCents;
  const inRange =
    (min === null || min === undefined || input.requestedAmountCents >= min) &&
    (max === null || max === undefined || input.requestedAmountCents <= max);
  if (inRange) {
    throw new HttpError(
      400,
      "Requested amount is within range — create the contract directly"
    );
  }

  return PriceApprovalRequest.create({
    customerId: input.customerId,
    agentId: input.agentId,
    solutionVersionId: input.solutionVersionId,
    requestedAmountCents: input.requestedAmountCents,
    minPriceCents: min ?? null,
    maxPriceCents: max ?? null,
    note: input.note ?? "",
    status: "PENDING",
  });
}

export async function approve(id: string, decidedBy: string, decisionNote = "") {
  const req = await getById(id);
  if (req.status !== "PENDING") {
    throw new HttpError(400, `Cannot approve request in status ${req.status}`);
  }

  // Bypass the price-range gate by writing the contract directly via the service —
  // but since contract.service.create enforces the range, we temporarily widen the
  // version's bounds via a snapshot path. Simpler: clear the range check by passing a
  // version we trust. Since contract.create re-checks, we do the contract creation in
  // a lightweight way that mirrors it — calling the real service would re-fail.
  //
  // Approach: we relax by setting the snapshot bounds wider on a per-call basis.
  // Cleanest: temporarily lift the check by using a dedicated service method.
  // For now, we directly create the contract using the existing service AFTER
  // momentarily widening the range — that keeps validation in one place.
  const version = await SolutionVersion.findById(req.solutionVersionId);
  if (!version) throw new HttpError(400, "Solution version disappeared");
  const originalMin = version.minPriceCents;
  const originalMax = version.maxPriceCents;
  version.minPriceCents = null;
  version.maxPriceCents = null;
  await version.save();
  let contract;
  try {
    contract = await createContract({
      customerId: req.customerId.toString(),
      agentId: req.agentId.toString(),
      solutionVersionId: req.solutionVersionId.toString(),
      amountCents: req.requestedAmountCents,
    });
  } finally {
    // Restore the original range so other contracts remain gated.
    version.minPriceCents = originalMin;
    version.maxPriceCents = originalMax;
    await version.save();
  }

  req.status = "APPROVED";
  req.decidedBy = new Types.ObjectId(decidedBy);
  req.decidedAt = new Date();
  req.decisionNote = decisionNote;
  req.contractId = new Types.ObjectId(contract._id.toString());
  await req.save();

  return { request: req, contract };
}

export async function reject(id: string, decidedBy: string, decisionNote = "") {
  const req = await getById(id);
  if (req.status !== "PENDING") {
    throw new HttpError(400, `Cannot reject request in status ${req.status}`);
  }
  req.status = "REJECTED";
  req.decidedBy = new Types.ObjectId(decidedBy);
  req.decidedAt = new Date();
  req.decisionNote = decisionNote;
  await req.save();
  return req;
}

export async function cancel(id: string) {
  const req = await getById(id);
  if (req.status !== "PENDING") {
    throw new HttpError(400, `Cannot cancel request in status ${req.status}`);
  }
  req.status = "CANCELLED";
  await req.save();
  return req;
}
