import { Lead, LEAD_STATUSES, type LeadStatus } from "./lead.model";
import { Customer } from "../customers/customer.model";
import { User } from "../users/user.model";
import { HttpError } from "../../middleware/error";
import { agentIdMatch, type Scope } from "../../lib/scope";

type CreateInput = {
  customerId: string;
  agentId: string;
  source?: string;
  notes?: string;
  expectedClose?: Date | null;
};

const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL", "LOST"],
  PROPOSAL: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

export async function list(
  filter: { agentId?: string; status?: LeadStatus },
  scope: Scope
) {
  const q: Record<string, unknown> = { deletedAt: null, ...agentIdMatch(scope) };
  if (filter.agentId) q.agentId = filter.agentId;
  if (filter.status) q.status = filter.status;
  return Lead.find(q).sort({ createdAt: -1 }).limit(200);
}

export async function getById(id: string, scope?: Scope) {
  const lead = await Lead.findOne({ _id: id, deletedAt: null });
  if (!lead) throw new HttpError(404, "Lead not found");
  if (scope && !scope.isAdmin && !scope.agentIds.includes(lead.agentId.toString())) {
    throw new HttpError(404, "Lead not found");
  }
  return lead;
}

export async function create(input: CreateInput) {
  const customer = await Customer.findOne({ _id: input.customerId, deletedAt: null });
  if (!customer) throw new HttpError(400, "Customer not found");

  const agent = await User.findOne({ _id: input.agentId, deletedAt: null });
  if (!agent) throw new HttpError(400, "Agent not found");
  if (agent.role !== "AGENT") throw new HttpError(400, "Lead owner must be AGENT");

  return Lead.create({
    customerId: input.customerId,
    agentId: input.agentId,
    source: input.source ?? "",
    notes: input.notes ?? "",
    expectedClose: input.expectedClose ?? null,
  });
}

export async function transition(id: string, nextStatus: LeadStatus) {
  const lead = await getById(id);
  const current = lead.status as LeadStatus;
  if (!ALLOWED_TRANSITIONS[current].includes(nextStatus)) {
    throw new HttpError(400, `Cannot transition lead from ${current} to ${nextStatus}`);
  }
  lead.status = nextStatus;
  await lead.save();
  return lead;
}

export { LEAD_STATUSES };
