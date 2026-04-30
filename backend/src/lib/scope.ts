import { Types } from "mongoose";
import { User } from "../modules/users/user.model";
import type { JwtPayload } from "../utils/jwt";

/**
 * Visibility scope for the current user.
 * - ADMIN: sees everything (filter is empty).
 * - AREA_MANAGER: sees themselves + their direct AGENT reports.
 * - AGENT: sees only themselves.
 *
 * Returned `agentIds` is the set of agentId values that the caller may "own".
 * Returned `userIds` is the same plus the caller themselves (used for commission queries
 * where the beneficiary may be a manager).
 */
export type Scope = {
  isAdmin: boolean;
  selfId: string;
  agentIds: string[]; // includes self if AGENT, or all reports if AREA_MANAGER
  userIds: string[]; // selfId + all reports
};

export async function buildScope(user: JwtPayload | undefined): Promise<Scope> {
  if (!user) {
    return { isAdmin: false, selfId: "", agentIds: [], userIds: [] };
  }
  if (user.role === "ADMIN") {
    return { isAdmin: true, selfId: user.sub, agentIds: [], userIds: [] };
  }
  if (user.role === "AREA_MANAGER") {
    const agentIds = (
      await User.find({ managerId: user.sub, role: "AGENT", deletedAt: null }).distinct("_id")
    ).map((x) => x.toString());
    return {
      isAdmin: false,
      selfId: user.sub,
      agentIds,
      userIds: [user.sub, ...agentIds],
    };
  }
  // AGENT (or unknown role) — only self.
  return { isAdmin: false, selfId: user.sub, agentIds: [user.sub], userIds: [user.sub] };
}

/**
 * Mongo `$match` fragment for filtering by `agentId` according to the scope.
 * Pass an empty object for ADMIN; otherwise restricts to the user's agentIds.
 */
export function agentIdMatch(scope: Scope): Record<string, unknown> {
  if (scope.isAdmin) return {};
  if (scope.agentIds.length === 0) return { agentId: null }; // matches nothing real
  return { agentId: { $in: scope.agentIds.map((id) => new Types.ObjectId(id)) } };
}

/**
 * Match for Customer collection — filters by assignedAgentId (and falls back to
 * "no assignment" being visible to nobody for non-admins). ADMIN sees all.
 */
export function customerScopeMatch(scope: Scope): Record<string, unknown> {
  if (scope.isAdmin) return {};
  if (scope.agentIds.length === 0) return { _id: null };
  return {
    assignedAgentId: { $in: scope.agentIds.map((id) => new Types.ObjectId(id)) },
  };
}
