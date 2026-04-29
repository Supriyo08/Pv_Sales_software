import { Types } from "mongoose";
import { Contract, type ContractStatus } from "./contract.model";
import { Customer } from "../customers/customer.model";
import { User } from "../users/user.model";
import { SolutionVersion } from "../catalog/solution-version.model";
import { Lead } from "../leads/lead.model";
import { Installation } from "../installations/installation.model";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";

type CreateInput = {
  customerId: string;
  agentId: string;
  solutionVersionId?: string;
  solutionId?: string;
  contractDate?: Date;
  amountCents: number;
  currency?: string;
  leadId?: string | null;
};

export async function list(filter: { agentId?: string; status?: ContractStatus }) {
  const q: Record<string, unknown> = {};
  if (filter.agentId) q.agentId = filter.agentId;
  if (filter.status) q.status = filter.status;
  return Contract.find(q).sort({ createdAt: -1 }).limit(200);
}

export async function getById(id: string) {
  const c = await Contract.findById(id);
  if (!c) throw new HttpError(404, "Contract not found");
  return c;
}

export async function create(input: CreateInput) {
  const customer = await Customer.findOne({ _id: input.customerId, deletedAt: null });
  if (!customer) throw new HttpError(400, "Customer not found");

  const agent = await User.findOne({ _id: input.agentId, deletedAt: null });
  if (!agent) throw new HttpError(400, "Agent not found");
  if (agent.role !== "AGENT") throw new HttpError(400, "Contract owner must be AGENT");

  let version;
  if (input.solutionVersionId) {
    version = await SolutionVersion.findById(input.solutionVersionId);
    if (!version) throw new HttpError(400, "Solution version not found");
  } else if (input.solutionId) {
    const at = input.contractDate ?? new Date();
    version = await SolutionVersion.findOne({
      solutionId: input.solutionId,
      validFrom: { $lte: at },
      $or: [{ validTo: null }, { validTo: { $gt: at } }],
    }).sort({ validFrom: -1 });
    if (!version) {
      throw new HttpError(400, "No active solution version at the given date");
    }
  } else {
    throw new HttpError(400, "Either solutionVersionId or solutionId is required");
  }

  if (input.leadId) {
    const lead = await Lead.findOne({ _id: input.leadId, deletedAt: null });
    if (!lead) throw new HttpError(400, "Lead not found");
  }

  return Contract.create({
    customerId: input.customerId,
    agentId: input.agentId,
    managerId: agent.managerId ?? null,
    territoryId: agent.territoryId ?? null,
    solutionVersionId: version._id,
    amountCents: input.amountCents,
    currency: input.currency ?? version.currency,
    leadId: input.leadId ?? null,
    status: "DRAFT",
  });
}

export async function sign(id: string) {
  const contract = await getById(id);
  if (contract.status !== "DRAFT") {
    throw new HttpError(400, `Cannot sign contract in status ${contract.status}`);
  }

  contract.status = "SIGNED";
  contract.signedAt = new Date();
  await contract.save();

  if (contract.leadId) {
    await Lead.updateOne({ _id: contract.leadId }, { status: "WON" });
  }

  await Installation.create({
    contractId: contract._id,
    status: "SCHEDULED",
    milestones: [{ status: "SCHEDULED", date: new Date(), notes: "Auto-created on contract sign" }],
  });

  events.emit("contract.signed", { contractId: contract._id.toString() });
  return contract;
}

export async function cancel(id: string, reason: string) {
  const contract = await getById(id);
  if (contract.status === "CANCELLED") return contract;
  contract.status = "CANCELLED";
  contract.cancelledAt = new Date();
  contract.cancellationReason = reason;
  await contract.save();
  events.emit("contract.cancelled", { contractId: contract._id.toString() });
  return contract;
}
