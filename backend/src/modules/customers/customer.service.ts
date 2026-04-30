import { Types } from "mongoose";
import { Customer } from "./customer.model";
import { User } from "../users/user.model";
import { HttpError } from "../../middleware/error";
import type { Scope } from "../../lib/scope";
import { customerScopeMatch } from "../../lib/scope";

type CreateInput = {
  fiscalCode: string;
  fullName: string;
  email?: string;
  phone?: string;
  address?: Record<string, string>;
  customFields?: Record<string, unknown>;
  assignedAgentId?: string | null;
};

export async function list(
  query: { search?: string },
  scope: Scope
) {
  const filter: Record<string, unknown> = {
    deletedAt: null,
    ...customerScopeMatch(scope),
  };
  if (query.search) {
    const re = new RegExp(query.search, "i");
    filter.$or = [{ fullName: re }, { email: re }, { fiscalCode: re }];
  }
  return Customer.find(filter).sort({ createdAt: -1 }).limit(100);
}

export async function getById(id: string, scope: Scope) {
  const filter: Record<string, unknown> = {
    _id: id,
    deletedAt: null,
    ...customerScopeMatch(scope),
  };
  const c = await Customer.findOne(filter);
  if (!c) throw new HttpError(404, "Customer not found");
  return c;
}

export async function create(input: CreateInput, scope: Scope) {
  const exists = await Customer.findOne({ fiscalCode: input.fiscalCode.toUpperCase() });
  if (exists) throw new HttpError(409, "Customer with this fiscal code already exists");
  // Default ownership: agents own what they create; managers/admins can leave null or assign explicitly.
  const assignedAgentId =
    input.assignedAgentId !== undefined
      ? input.assignedAgentId
      : scope.isAdmin
        ? null
        : scope.selfId; // AGENT or AREA_MANAGER becomes the owner
  return Customer.create({
    ...input,
    assignedAgentId,
  });
}

export async function update(id: string, input: Partial<CreateInput>, scope: Scope) {
  // Verify the user can see the customer in the first place.
  await getById(id, scope);
  const updates: Record<string, unknown> = { ...input };
  if (input.fiscalCode) updates.fiscalCode = input.fiscalCode.toUpperCase();
  // Don't allow non-admin to change ownership via plain update — use /assign instead.
  if (!scope.isAdmin) delete updates.assignedAgentId;
  const updated = await Customer.findOneAndUpdate(
    { _id: id, deletedAt: null },
    updates,
    { new: true }
  );
  if (!updated) throw new HttpError(404, "Customer not found");
  return updated;
}

export async function softDelete(id: string, scope: Scope) {
  await getById(id, scope);
  const result = await Customer.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), email: "", phone: "", address: {} },
    { new: true }
  );
  if (!result) throw new HttpError(404, "Customer not found");
}

/**
 * Reassign a customer to a different agent.
 * - ADMIN: can assign to any AGENT (or null to unassign)
 * - AREA_MANAGER: can assign to any AGENT in their network
 * - AGENT: not allowed (returns 403)
 */
export async function reassign(id: string, agentId: string | null, scope: Scope) {
  if (!scope.isAdmin && !(await isAreaManager(scope.selfId))) {
    throw new HttpError(403, "Only admins or area managers can reassign customers");
  }

  if (agentId !== null) {
    if (!Types.ObjectId.isValid(agentId)) {
      throw new HttpError(400, "Invalid agentId");
    }
    const agent = await User.findOne({ _id: agentId, deletedAt: null });
    if (!agent || agent.role !== "AGENT") {
      throw new HttpError(400, "Target user must be an active AGENT");
    }
    if (!scope.isAdmin) {
      // AREA_MANAGER may only assign to agents in their own network.
      const isMine =
        agent.managerId && agent.managerId.toString() === scope.selfId;
      if (!isMine) {
        throw new HttpError(403, "Cannot reassign to an agent outside your network");
      }
    }
  }

  // Use raw filter (not customerScopeMatch) for ADMIN; for AREA_MANAGER, ensure
  // the customer is currently within their visibility before reassigning.
  const filter: Record<string, unknown> = { _id: id, deletedAt: null };
  if (!scope.isAdmin) {
    Object.assign(filter, customerScopeMatch(scope));
  }

  const updated = await Customer.findOneAndUpdate(
    filter,
    { assignedAgentId: agentId },
    { new: true }
  );
  if (!updated) throw new HttpError(404, "Customer not found or not in your scope");
  return updated;
}

async function isAreaManager(userId: string): Promise<boolean> {
  const u = await User.findById(userId).select("role");
  return u?.role === "AREA_MANAGER";
}
