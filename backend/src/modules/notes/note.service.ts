import { Note, type NoteTarget, type NoteDoc } from "./note.model";
import { Customer } from "../customers/customer.model";
import { Contract } from "../contracts/contract.model";
import { HttpError } from "../../middleware/error";
import type { Scope } from "../../lib/scope";
import { agentIdMatch, customerScopeMatch } from "../../lib/scope";

/**
 * Visibility check — re-uses the same scope rules as the parent resources, so
 * an AGENT can only post/read notes on their own customers/contracts, AM on
 * their network, ADMIN sees all.
 */
async function ensureTargetVisible(
  targetType: NoteTarget,
  targetId: string,
  scope: Scope
): Promise<void> {
  if (targetType === "Customer") {
    const filter: Record<string, unknown> = {
      _id: targetId,
      deletedAt: null,
      ...customerScopeMatch(scope),
    };
    const exists = await Customer.exists(filter);
    if (!exists) throw new HttpError(404, "Customer not found or out of scope");
    return;
  }
  if (targetType === "Contract") {
    const filter: Record<string, unknown> = { _id: targetId, ...agentIdMatch(scope) };
    const exists = await Contract.exists(filter);
    if (!exists) throw new HttpError(404, "Contract not found or out of scope");
    return;
  }
}

export async function list(
  targetType: NoteTarget,
  targetId: string,
  scope: Scope
): Promise<NoteDoc[]> {
  await ensureTargetVisible(targetType, targetId, scope);
  return Note.find({ targetType, targetId }).sort({ createdAt: -1 }).limit(500);
}

export async function create(
  targetType: NoteTarget,
  targetId: string,
  authorId: string,
  body: string,
  scope: Scope
): Promise<NoteDoc> {
  await ensureTargetVisible(targetType, targetId, scope);
  const trimmed = body.trim();
  if (!trimmed) throw new HttpError(400, "Note body cannot be empty");
  return Note.create({ targetType, targetId, authorId, body: trimmed });
}
