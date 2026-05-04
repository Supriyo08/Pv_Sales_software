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

/** Treat the legacy v1.1 "PENDING" as the manager-stage equivalent. */
function isPendingManager(status: AdvanceAuthStatus): boolean {
  return status === "PENDING" || status === "PENDING_MANAGER";
}

function isTerminal(status: AdvanceAuthStatus): boolean {
  return (
    status === "AUTHORIZED" ||
    status === "DECLINED" ||
    status === "DECLINED_BY_MANAGER" ||
    status === "DECLINED_BY_ADMIN" ||
    status === "RESOLVED_BY_INSTALL"
  );
}

/**
 * Per Review 1.1 §8 + Review 1.2 (2026-05-04): create-or-noop on contract
 * approval. Idempotent — re-approving the same contract returns the existing
 * record. Initial status is PENDING_MANAGER.
 */
export async function ensureForContract(contractId: string) {
  const existing = await AdvancePayAuthorization.findOne({ contractId });
  if (existing) return existing;
  const created = await AdvancePayAuthorization.create({
    contractId,
    status: "PENDING_MANAGER",
  });
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

/**
 * Per Review 1.2 (2026-05-04): stage 1 — area manager decision.
 * APPROVED → escalates to PENDING_ADMIN (no commissions yet).
 * DECLINED → terminal DECLINED_BY_MANAGER (commission deferred to install).
 */
export async function decideManager(
  id: string,
  decision: "APPROVED" | "DECLINED",
  deciderId: string,
  note: string
) {
  const a = await getById(id);
  const status = a.status as AdvanceAuthStatus;
  if (!isPendingManager(status)) {
    throw new HttpError(
      400,
      `Authorization is not awaiting manager decision (current: ${status})`
    );
  }

  a.managerDecidedBy = deciderId as unknown as typeof a.managerDecidedBy;
  a.managerDecidedAt = new Date();
  a.managerDecision = decision;
  a.managerNote = note;
  a.decidedBy = deciderId as unknown as typeof a.decidedBy;
  a.decidedAt = new Date();
  a.note = note;
  a.status = decision === "APPROVED" ? "PENDING_ADMIN" : "DECLINED_BY_MANAGER";
  await a.save();

  events.emit("advance_pay_auth.decided", {
    contractId: a.contractId.toString(),
    authorizationId: a._id.toString(),
    decision,
    decidedBy: deciderId,
    stage: "MANAGER",
  });

  // Manager declined: stop here. Commission will fire on install activation.
  return a;
}

/**
 * Per Review 1.2 (2026-05-04): stage 2 — admin decision (only after manager
 * approval). APPROVED → AUTHORIZED + commissions fire.
 * DECLINED → DECLINED_BY_ADMIN (commission deferred to install).
 */
export async function decideAdmin(
  id: string,
  decision: "APPROVED" | "DECLINED",
  deciderId: string,
  note: string
) {
  const a = await getById(id);
  if (a.status !== "PENDING_ADMIN") {
    throw new HttpError(
      400,
      `Authorization is not awaiting admin decision (current: ${a.status}). The area manager must approve first.`
    );
  }

  a.adminDecidedBy = deciderId as unknown as typeof a.adminDecidedBy;
  a.adminDecidedAt = new Date();
  a.adminDecision = decision;
  a.adminNote = note;
  a.decidedBy = deciderId as unknown as typeof a.decidedBy;
  a.decidedAt = new Date();
  a.note = note;
  a.status = decision === "APPROVED" ? "AUTHORIZED" : "DECLINED_BY_ADMIN";
  await a.save();

  events.emit("advance_pay_auth.decided", {
    contractId: a.contractId.toString(),
    authorizationId: a._id.toString(),
    decision,
    decidedBy: deciderId,
    stage: "ADMIN",
  });

  if (decision === "APPROVED") {
    // Both stages green — fire commissions now (early payment).
    await emitCommissionableIfNeeded(a.contractId.toString());
  }

  return a;
}

/**
 * Per Review 1.1 §8: when installation activates without a final AUTHORIZED
 * decision, commissions auto-fire on the deferred path. Any non-terminal
 * status is parked as RESOLVED_BY_INSTALL so the queue stays clean.
 */
export async function resolveByInstallActivation(contractId: string) {
  const a = await AdvancePayAuthorization.findOne({ contractId });
  if (!a) {
    await emitCommissionableIfNeeded(contractId);
    return;
  }
  const status = a.status as AdvanceAuthStatus;
  if (status === "AUTHORIZED") return; // commissions already paid early

  if (!isTerminal(status)) {
    a.status = "RESOLVED_BY_INSTALL";
    a.decidedAt = new Date();
    a.note = "auto-resolved on installation activation";
    await a.save();
  }
  await emitCommissionableIfNeeded(contractId);
}

async function emitCommissionableIfNeeded(contractId: string) {
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
  await commissionService.generateForContract(
    contractId,
    "auto-generated via advance-pay-auth flow"
  );
  events.emit("contract.commissionable", { contractId });
}

/**
 * Per Review 1.2 (2026-05-04): the sidebar badge needs role-aware counts so
 * managers see only their pending decisions, and admins see only theirs.
 */
export async function pendingCount(
  scope: Scope,
  stage: "MANAGER" | "ADMIN" | "ANY" = "ANY"
): Promise<number> {
  const stageStatuses: Record<typeof stage, AdvanceAuthStatus[]> = {
    MANAGER: ["PENDING", "PENDING_MANAGER"],
    ADMIN: ["PENDING_ADMIN"],
    ANY: ["PENDING", "PENDING_MANAGER", "PENDING_ADMIN"],
  };
  const q: Record<string, unknown> = { status: { $in: stageStatuses[stage] } };
  if (!scope.isAdmin) {
    const visibleContracts = await Contract.find(agentIdMatch(scope), { _id: 1 }).lean();
    q.contractId = { $in: visibleContracts.map((c) => c._id) };
  }
  return AdvancePayAuthorization.countDocuments(q);
}
