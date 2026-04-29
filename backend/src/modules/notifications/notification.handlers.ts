import { events } from "../../lib/events";
import * as notificationService from "./notification.service";
import { Contract } from "../contracts/contract.model";
import { logger } from "../../utils/logger";

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

  logger.info("Notification handlers registered");
}
