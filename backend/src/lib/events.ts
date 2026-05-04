import { EventEmitter } from "events";
import { logger } from "../utils/logger";

export type EventMap = {
  "contract.signed": { contractId: string };
  "contract.cancelled": { contractId: string };
  "installation.activated": { installationId: string; contractId: string };
  "solution.version.updated": { solutionId: string; versionId: string };
  "bonus.calculated": { userId: string; period: string; amountCents: number };
  "payment.created": { paymentId: string; userId: string };
  // Per Review 1.1 §8: contract approved by admin/AM (legacy v1.1 path emitted
  // contract.signed directly; v1.2 splits this so the advance-pay-auth flow can
  // gate commission generation on AM authorization).
  "contract.approved": { contractId: string };
  "contract.commissionable": { contractId: string };
  // Per Review 1.1 §1: edit-request workflow.
  "contract.updated": { contractId: string };
  "contract.edit_requested": {
    requestId: string;
    contractId: string;
    requestedBy: string;
  };
  "contract.edit_decided": {
    requestId: string;
    contractId: string;
    decision: "APPROVED" | "REJECTED";
    requestedBy: string;
  };
  // Per Review 1.1 §1: generation approval gate.
  "contract.generation_requested": { contractId: string };
  "contract.generation_approved": { contractId: string; agentId: string };
  // Per Review 1.1 §8 + Review 1.2 (2026-05-04): two-stage advance-payment
  // authorization. Stage 1 = manager, Stage 2 = admin (only after manager
  // approval). `decision` is the decision at THAT stage; `stage` indicates
  // which gate just decided.
  "advance_pay_auth.requested": { contractId: string; authorizationId: string };
  "advance_pay_auth.decided": {
    contractId: string;
    authorizationId: string;
    decision: "APPROVED" | "DECLINED";
    decidedBy: string;
    stage: "MANAGER" | "ADMIN";
  };
  // Per Review 1.1 §7: bonus/commission reversal review.
  "installation.reversed": { installationId: string; contractId: string };
  "reversal_review.created": {
    reviewId: string;
    contractId: string;
    kind: "COMMISSION" | "BONUS";
  };
};

class TypedEmitter {
  private bus = new EventEmitter();

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.bus.emit(event, payload);
  }

  on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void | Promise<void>
  ): void {
    this.bus.on(event, async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event, payload }, "Event handler failed");
      }
    });
  }
}

export const events = new TypedEmitter();
