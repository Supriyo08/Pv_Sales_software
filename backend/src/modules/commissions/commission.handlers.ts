import { events } from "../../lib/events";
import * as commissionService from "./commission.service";
import { logger } from "../../utils/logger";

export function registerCommissionHandlers(): void {
  events.on("contract.signed", async ({ contractId }) => {
    const created = await commissionService.generateForContract(contractId);
    logger.info(
      { contractId, count: created.length },
      "Generated commissions for signed contract"
    );
  });

  events.on("contract.cancelled", async ({ contractId }) => {
    const n = await commissionService.supersedeForContract(contractId, "contract.cancelled");
    logger.info({ contractId, superseded: n }, "Superseded commissions for cancelled contract");
  });

  events.on("solution.version.updated", async ({ solutionId, versionId }) => {
    logger.info({ solutionId, versionId }, "Solution version updated — sweeping affected contracts");
    const result = await commissionService.recalculateContractsForSolution(
      solutionId,
      `auto-recalc on solution.version.updated (${versionId})`
    );
    logger.info({ solutionId, ...result }, "Auto-recalc finished");
  });
}
