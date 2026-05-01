import {
  AdvancePayAuthorization,
  type AdvanceAuthStatus,
} from "./advance-pay-auth.model";
import { Contract } from "../contracts/contract.model";
import { Commission } from "../commissions/commission.model";
import * as commissionService from "../commissions/commission.service";
import type { Scope } from "../../lib/scope";
import { agentIdMatch } from "../../lib/scope";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";
import { logger } from "../../utils/logger";

/**
 * Per Review 1.1 §8: create-or-noop on contract approval. Idempotent — re-approving
 * the same contract returns the existing record.
 */
export async function ensureForContract(contractId: string) {
  const existing = await AdvancePayAuthorization.findOne({ contractId });
  if (existing) return existing;
  const created = await AdvancePayAuthorization.create({ contractId });
  events.emit("advance_pay_auth.requested", {
    contractId,
    authorizationId: created._id.toString(),
  });
  return created;
}

export async function list(
  filter: { status?: AdvanceAuthStatus; contractId?: string },
  scope: Scope
) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.contractId) q.contractId = filter.contractId;
  if (!scope.isAdmin) {
    const visibleContracts = await Contract.find(agentIdMatch(scope), { _id: 1 }).lean();
    q.contractId = { $in: visibleContracts.map((c) => c._id) };
  }
  return AdvancePayAuthorization.find(q).sort({ createdAt: -1 }).limit(200);
}

export async function getById(id: string) {
  const a = await AdvancePayAuthorization.findById(id);
  if (!a) throw new HttpError(404, "Authorization not found");
  return a;
}

export async function decide(
  id: string,
  decision: "AUTHORIZED" | "DECLINED",
  deciderId: string,
  note: string
) {
  const a = await getById(id);
  if (a.status !== "PENDING") {
    throw new HttpError(400, `Authorization already ${a.status.toLowerCase()}`);
  }
  a.status = decision;
  a.decidedBy = deciderId as unknown as typeof a.decidedBy;
  a.decidedAt = new Date();
  a.note = note;
  await a.save();

  events.emit("advance_pay_auth.decided", {
    contractId: a.contractId.toString(),
    authorizationId: a._id.toString(),
    decision,
    decidedBy: deciderId,
  });

  if (decision === "AUTHORIZED") {
    // Per Review 1.1 §8: AM authorizes early payment → commissions fire now.
    // The commission handler is idempotent (skip if active commissions exist).
    await emitCommissionableIfNeeded(a.contractId.toString());
  }

  return a;
}

/**
 * Per Review 1.1 §8: when installation activates without AM authorization, fall
 * back to the deferred path — commissions auto-fire and we mark the pending
 * auth as RESOLVED_BY_INSTALL so the queue stays clean.
 */
export async function resolveByInstallActivation(contractId: string) {
  const a = await AdvancePayAuthorization.findOne({ contractId });
  if (!a) {
    // Defensive: contract that bypassed the v1.2 approval flow (e.g. a v1.1
    // legacy contract). Just emit commissionable; commission handler is idempotent.
    await emitCommissionableIfNeeded(contractId);
    return;
  }
  if (a.status === "AUTHORIZED") {
    // Commission already paid early; nothing to do.
    return;
  }
  if (a.status === "PENDING") {
    a.status = "RESOLVED_BY_INSTALL";
    a.decidedAt = new Date();
    a.note = "auto-resolved on installation activation";
    await a.save();
  }
  await emitCommissionableIfNeeded(contractId);
}

async function emitCommissionableIfNeeded(contractId: string) {
  // Idempotent guard — skip if commissions already exist (e.g. legacy approve()
  // path in older tests, or repeated trigger paths).
  const existing = await Commission.countDocuments({
    contractId,
    supersededAt: null,
  });
  if (existing > 0) {
    logger.info(
      { contractId, existing },
      "Skipping advance-pay-auth commission generation — already exists"
    );
    return;
  }
  // Direct call (synchronous) — event handlers can be racy in tests, and we want
  // commission generation to happen in the same tick as the auth decision.
  await commissionService.generateForContract(
    contractId,
    "auto-generated via advance-pay-auth flow"
  );
  // Emit the event too so any downstream listeners (analytics, side-effects) hear it.
  events.emit("contract.commissionable", { contractId });
}

export async function pendingCount(scope: Scope): Promise<number> {
  const q: Record<string, unknown> = { status: "PENDING" };
  if (!scope.isAdmin) {
    const visibleContracts = await Contract.find(agentIdMatch(scope), { _id: 1 }).lean();
    q.contractId = { $in: visibleContracts.map((c) => c._id) };
  }
  return AdvancePayAuthorization.countDocuments(q);
}
