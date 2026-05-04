import { events } from "../../lib/events";
import * as notificationService from "./notification.service";
import { Contract } from "../contracts/contract.model";
import { User } from "../users/user.model";
import { logger } from "../../utils/logger";

async function notifyAdmins(
  kind:
    | "CONTRACT_EDIT_REQUESTED"
    | "CONTRACT_GENERATION_REQUESTED"
    | "ADVANCE_PAY_AUTH_REQUESTED"
    | "REVERSAL_REVIEW_CREATED",
  title: string,
  body: string,
  payload: Record<string, unknown>
) {
  const admins = await User.find({ role: "ADMIN", deletedAt: null }, { _id: 1 }).lean();
  await Promise.all(
    admins.map((u) =>
      notificationService.create({
        userId: u._id.toString(),
        kind,
        title,
        body,
        payload,
      })
    )
  );
}

export function registerNotificationHandlers(): void {
  events.on("contract.signed", async ({ contractId }) => {
    const contract = await Contract.findById(contractId);
    if (!contract) return;
    if (contract.managerId) {
      await notificationService.create({
        userId: contract.managerId.toString(),
        kind: "CONTRACT_SIGNED",
        title: "New contract signed",
        body: `Contract ${contract._id} signed for ${contract.amountCents / 100} ${contract.currency}`,
        payload: { contractId: contract._id.toString() },
      });
    }
  });

  events.on("contract.cancelled", async ({ contractId }) => {
    const contract = await Contract.findById(contractId);
    if (!contract) return;
    if (contract.agentId) {
      await notificationService.create({
        userId: contract.agentId.toString(),
        kind: "CONTRACT_CANCELLED",
        title: "Contract cancelled",
        body: `Contract ${contract._id} was cancelled`,
        payload: { contractId: contract._id.toString() },
      });
    }
  });

  events.on("bonus.calculated", async ({ userId, period, amountCents }) => {
    await notificationService.create({
      userId,
      kind: "BONUS_CALCULATED",
      title: `Bonus for ${period}`,
      body: `You qualified for a bonus of ${(amountCents / 100).toFixed(2)} EUR`,
      payload: { period, amountCents },
    });
  });

  events.on("payment.created", async ({ paymentId, userId }) => {
    await notificationService.create({
      userId,
      kind: "PAYMENT_CREATED",
      title: "New payment",
      body: `A new payment statement is available`,
      payload: { paymentId },
    });
  });

  // Per Review 1.1 §1: contract edit-request workflow.
  events.on(
    "contract.edit_requested",
    async ({
      requestId,
      contractId,
    }: {
      requestId: string;
      contractId: string;
      requestedBy: string;
    }) => {
      const contract = await Contract.findById(contractId);
      if (!contract) return;
      const targets = new Set<string>();
      if (contract.managerId) targets.add(contract.managerId.toString());
      const admins = await User.find({ role: "ADMIN", deletedAt: null }, { _id: 1 }).lean();
      admins.forEach((a) => targets.add(a._id.toString()));
      await Promise.all(
        Array.from(targets).map((userId) =>
          notificationService.create({
            userId,
            kind: "CONTRACT_EDIT_REQUESTED",
            title: "Contract edit requested",
            body: `An agent requested edits to contract ${contractId}`,
            payload: { contractId, requestId },
          })
        )
      );
    }
  );

  events.on(
    "contract.edit_decided",
    async ({
      requestId,
      contractId,
      decision,
      requestedBy,
    }: {
      requestId: string;
      contractId: string;
      decision: "APPROVED" | "REJECTED";
      requestedBy: string;
    }) => {
      const kind =
        decision === "APPROVED" ? "CONTRACT_EDIT_APPROVED" : "CONTRACT_EDIT_REJECTED";
      await notificationService.create({
        userId: requestedBy,
        kind,
        title: `Contract edit ${decision.toLowerCase()}`,
        body: `Your edit request on contract ${contractId} was ${decision.toLowerCase()}`,
        payload: { contractId, requestId, decision },
      });
    }
  );

  // Per Review 1.1 §1: generation approval gate.
  events.on(
    "contract.generation_requested",
    async ({ contractId }: { contractId: string }) => {
      await notifyAdmins(
        "CONTRACT_GENERATION_REQUESTED",
        "Contract PDF awaiting approval",
        `Agent generated a contract PDF that needs review before sign-off`,
        { contractId }
      );
    }
  );

  events.on(
    "contract.generation_approved",
    async ({ contractId, agentId }: { contractId: string; agentId: string }) => {
      await notificationService.create({
        userId: agentId,
        kind: "CONTRACT_GENERATION_APPROVED",
        title: "Generated contract approved",
        body: `Your generated contract is approved — you can now sign and upload the signed scan.`,
        payload: { contractId },
      });
    }
  );

  // Per Review 1.1 §8 + Review 1.2 (2026-05-04): advance-pay request goes to
  // the assigned area manager FIRST. Admins are NOT pinged at this stage —
  // they only get notified once the manager approves (so the admin queue is
  // never cluttered with requests that may yet be denied at stage 1).
  events.on(
    "advance_pay_auth.requested",
    async ({
      contractId,
      authorizationId,
    }: {
      contractId: string;
      authorizationId: string;
    }) => {
      const contract = await Contract.findById(contractId);
      if (!contract) return;
      if (contract.managerId) {
        await notificationService.create({
          userId: contract.managerId.toString(),
          kind: "ADVANCE_PAY_AUTH_REQUESTED",
          title: "Advance commission authorization — your decision",
          body: `Approve or decline the request to pay the agent's commission early on contract ${contractId}. If you approve, the request goes to admin for final sign-off.`,
          payload: { contractId, authorizationId, stage: "MANAGER" },
        });
      }
    }
  );

  // Per Review 1.2 (2026-05-04): two-stage decision feedback.
  // Stage 1 APPROVED → notify admins; DECLINED → notify the requesting agent.
  // Stage 2 APPROVED/DECLINED → notify the agent (final outcome).
  events.on(
    "advance_pay_auth.decided",
    async ({
      contractId,
      authorizationId,
      decision,
      stage,
    }: {
      contractId: string;
      authorizationId: string;
      decision: "APPROVED" | "DECLINED";
      decidedBy: string;
      stage: "MANAGER" | "ADMIN";
    }) => {
      const contract = await Contract.findById(contractId);
      if (!contract) return;

      if (stage === "MANAGER" && decision === "APPROVED") {
        // Escalate to admins.
        await notifyAdmins(
          "ADVANCE_PAY_AUTH_REQUESTED",
          "Advance commission authorization — admin sign-off needed",
          `Manager approved early commission payment on contract ${contractId}. Please review.`,
          { contractId, authorizationId, stage: "ADMIN" }
        );
        return;
      }

      // Stage 1 declined OR stage 2 decided → tell the agent the outcome.
      if (contract.agentId) {
        const decidedLabel =
          stage === "MANAGER"
            ? decision === "APPROVED"
              ? "approved by your area manager — pending admin sign-off"
              : "declined by your area manager — commission will pay on installation"
            : decision === "APPROVED"
              ? "fully approved — early commission paid now"
              : "declined by admin — commission will pay on installation";
        await notificationService.create({
          userId: contract.agentId.toString(),
          kind: "ADVANCE_PAY_AUTH_DECIDED",
          title: "Advance commission decision",
          body: `Contract ${contractId}: ${decidedLabel}.`,
          payload: { contractId, authorizationId, stage, decision },
        });
      }
    }
  );

  // Per Review 1.1 §7: reversal review queue.
  events.on(
    "reversal_review.created",
    async ({
      reviewId,
      contractId,
      kind,
    }: {
      reviewId: string;
      contractId: string;
      kind: string;
    }) => {
      await notifyAdmins(
        "REVERSAL_REVIEW_CREATED",
        "Reversal review needed",
        `An installation backing a ${kind.toLowerCase()} was cancelled — admin decision required`,
        { reviewId, contractId, reversalKind: kind }
      );
    }
  );

  logger.info("Notification handlers registered");
}
