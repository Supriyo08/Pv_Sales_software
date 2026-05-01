import {
  ContractEditRequest,
  type EditRequestStatus,
} from "./contract-edit-request.model";
import * as contractService from "../contracts/contract.service";
import type { EditableContractFields } from "../contracts/contract.service";
import type { Scope } from "../../lib/scope";
import { agentIdMatch } from "../../lib/scope";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";
import { Contract } from "../contracts/contract.model";

const EDITABLE_KEYS = new Set([
  "amountCents",
  "paymentMethod",
  "advanceCents",
  "installmentPlanId",
  "solutionVersionId",
]);

function whitelist(input: Record<string, unknown>): EditableContractFields {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (EDITABLE_KEYS.has(k)) out[k] = v;
  }
  return out as EditableContractFields;
}

type CreateInput = {
  contractId: string;
  requestedBy: string;
  changes: Record<string, unknown>;
  reason?: string;
};

export async function create(input: CreateInput) {
  const cleaned = whitelist(input.changes);
  if (Object.keys(cleaned).length === 0) {
    throw new HttpError(400, "No editable fields provided");
  }

  // Caller (controller) already enforces visibility scope. We additionally guard
  // against piling up requests on contracts that no longer accept edits.
  const contract = await Contract.findById(input.contractId);
  if (!contract) throw new HttpError(404, "Contract not found");
  if (contract.status === "CANCELLED") {
    throw new HttpError(400, "Cannot request edits on a cancelled contract");
  }

  const existing = await ContractEditRequest.findOne({
    contractId: input.contractId,
    status: "PENDING",
  });
  if (existing) {
    throw new HttpError(
      400,
      "A pending edit request already exists for this contract; decide it before submitting another"
    );
  }

  const created = await ContractEditRequest.create({
    contractId: input.contractId,
    requestedBy: input.requestedBy,
    changes: cleaned,
    reason: input.reason ?? "",
  });

  events.emit("contract.edit_requested", {
    requestId: created._id.toString(),
    contractId: input.contractId,
    requestedBy: input.requestedBy,
  });

  return created;
}

export async function list(
  filter: { status?: EditRequestStatus; contractId?: string },
  scope: Scope
) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.contractId) q.contractId = filter.contractId;

  if (!scope.isAdmin) {
    // Agents see only their own requests; managers see requests for contracts they
    // can see (matches contract.list scoping).
    const contracts = await Contract.find(agentIdMatch(scope), { _id: 1 }).lean();
    q.contractId = { $in: contracts.map((c) => c._id) };
  }

  return ContractEditRequest.find(q).sort({ createdAt: -1 }).limit(200);
}

export async function getById(id: string) {
  const er = await ContractEditRequest.findById(id);
  if (!er) throw new HttpError(404, "Edit request not found");
  return er;
}

export async function approve(id: string, deciderId: string, note: string) {
  const er = await getById(id);
  if (er.status !== "PENDING") {
    throw new HttpError(400, `Edit request already ${er.status.toLowerCase()}`);
  }

  // Apply the changes to the contract — re-runs all create-time validations.
  await contractService.applyEdit(
    er.contractId.toString(),
    er.changes as EditableContractFields
  );

  er.status = "APPROVED";
  er.decidedBy = deciderId as unknown as typeof er.decidedBy;
  er.decidedAt = new Date();
  er.decisionNote = note;
  await er.save();

  events.emit("contract.edit_decided", {
    requestId: er._id.toString(),
    contractId: er.contractId.toString(),
    decision: "APPROVED",
    requestedBy: er.requestedBy.toString(),
  });

  return er;
}

export async function reject(id: string, deciderId: string, note: string) {
  const er = await getById(id);
  if (er.status !== "PENDING") {
    throw new HttpError(400, `Edit request already ${er.status.toLowerCase()}`);
  }
  er.status = "REJECTED";
  er.decidedBy = deciderId as unknown as typeof er.decidedBy;
  er.decidedAt = new Date();
  er.decisionNote = note;
  await er.save();

  events.emit("contract.edit_decided", {
    requestId: er._id.toString(),
    contractId: er.contractId.toString(),
    decision: "REJECTED",
    requestedBy: er.requestedBy.toString(),
  });

  return er;
}

export async function cancel(id: string, requesterId: string) {
  const er = await getById(id);
  if (er.status !== "PENDING") {
    throw new HttpError(400, `Edit request already ${er.status.toLowerCase()}`);
  }
  if (er.requestedBy.toString() !== requesterId) {
    throw new HttpError(403, "Only the requester can cancel this request");
  }
  er.status = "CANCELLED";
  er.decidedAt = new Date();
  await er.save();
  return er;
}

export async function pendingCount(scope: Scope): Promise<number> {
  const q: Record<string, unknown> = { status: "PENDING" };
  if (!scope.isAdmin) {
    const contracts = await Contract.find(agentIdMatch(scope), { _id: 1 }).lean();
    q.contractId = { $in: contracts.map((c) => c._id) };
  }
  return ContractEditRequest.countDocuments(q);
}
