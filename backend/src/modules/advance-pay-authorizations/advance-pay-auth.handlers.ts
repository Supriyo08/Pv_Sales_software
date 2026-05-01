import { events } from "../../lib/events";
import * as service from "./advance-pay-auth.service";
import { logger } from "../../utils/logger";

export function registerAdvancePayAuthHandlers(): void {
  // Per Review 1.1 §8: when admin/AM approves a contract, immediately create the
  // separate advance-pay authorization request (so the AM gets a chance to
  // greenlight early commission payment).
  events.on("contract.approved", async ({ contractId }) => {
    await service.ensureForContract(contractId);
    logger.info({ contractId }, "Advance-pay authorization created on contract approval");
  });

  // Per Review 1.1 §8: when installation activates and the AM never authorized
  // (declined or still pending), commissions fire on the deferred path.
  events.on("installation.activated", async ({ contractId }) => {
    await service.resolveByInstallActivation(contractId);
  });
}
