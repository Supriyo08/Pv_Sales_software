import { events } from "../../lib/events";
import * as commissionService from "./commission.service";
import { Commission } from "./commission.model";
import { logger } from "../../utils/logger";

async function generateIfNoneActive(contractId: string, reason: string) {
  const existing = await Commission.countDocuments({
    contractId,
    supersededAt: null,
  });
  if (existing > 0) {
    logger.info(
      { contractId, existing },
      "Skipping commission generation — active commissions already exist for contract"
    );
    return [];
  }
  return commissionService.generateForContract(contractId, reason);
}

export function registerCommissionHandlers(): void {
  // Legacy path (v1.1 / approvalRequired=false): commission fires on sign.
  events.on("contract.signed", async ({ contractId }) => {
    const created = await generateIfNoneActive(
      contractId,
      "auto-generated on contract.signed"
    );
    logger.info(
      { contractId, count: created.length },
      "Generated commissions for signed contract"
    );
  });

  // Per Review 1.1 §8: commission generation now gated on advance-pay
  // authorization (AM authorizes) OR installation activation (deferred path).
  events.on("contract.commissionable", async ({ contractId }) => {
    const created = await generateIfNoneActive(
      contractId,
      "auto-generated on contract.commissionable"
    );
    logger.info(
      { contractId, count: created.length },
      "Generated commissions for commissionable contract"
    );
  });

  events.on("contract.cancelled", async ({ contractId }) => {
    const n = await commissionService.supersedeForContract(contractId, "contract.cancelled");
    logger.info({ contractId, superseded: n }, "Superseded commissions for cancelled contract");
  });

  // Per Review 1.1 §1: when admin/AM approves a ContractEditRequest, the contract
  // is mutated; recalculate to keep the ledger consistent. recalculateForContract
  // supersedes existing active rows then regenerates from the (now-updated)
  // contract — no-op for DRAFT/unsigned contracts that haven't fired commissions.
  events.on("contract.updated", async ({ contractId }: { contractId: string }) => {
    const result = await commissionService.recalculateForContract(
      contractId,
      "auto-recalc on contract.updated"
    );
    logger.info({ contractId, ...result }, "Recalculated commissions for updated contract");
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
