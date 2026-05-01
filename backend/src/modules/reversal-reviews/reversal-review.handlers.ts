import { events } from "../../lib/events";
import * as service from "./reversal-review.service";
import { logger } from "../../utils/logger";

export function registerReversalReviewHandlers(): void {
  // Per Review 1.1 §7: installation cancellation → flag every active commission
  // / bonus tied to it for admin review. We never auto-revert.
  events.on("installation.reversed", async ({ installationId }) => {
    const created = await service.createForInstallation(installationId);
    logger.info({ installationId, created }, "Reversal reviews created");
  });
}
