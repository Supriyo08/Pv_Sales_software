import { Types, type HydratedDocument } from "mongoose";
import { Commission, type CommissionDoc } from "./commission.model";
import { Contract } from "../contracts/contract.model";
import { SolutionVersion } from "../catalog/solution-version.model";
import { calcCommissionCents } from "../../lib/money";
import { logger } from "../../utils/logger";

type CommissionHydrated = HydratedDocument<CommissionDoc>;

type ListFilter = {
  beneficiaryUserId?: string;
  contractId?: string;
  active?: boolean;
  period?: string;
};

export async function list(filter: ListFilter) {
  const q: Record<string, unknown> = {};
  if (filter.beneficiaryUserId) q.beneficiaryUserId = filter.beneficiaryUserId;
  if (filter.contractId) q.contractId = filter.contractId;
  if (filter.period) q.period = filter.period;
  if (filter.active === true) q.supersededAt = null;
  return Commission.find(q).sort({ generatedAt: -1 }).limit(500);
}

export async function generateForContract(
  contractId: string,
  reason = "auto-generated on contract.signed",
  opts: { useActiveVersion?: boolean } = {}
) {
  const contract = await Contract.findById(contractId);
  if (!contract) {
    logger.warn({ contractId }, "Cannot generate commissions: contract not found");
    return [];
  }

  let version;
  if (opts.useActiveVersion) {
    const at = contract.signedAt ?? contract.createdAt;
    const sourceVersion = await SolutionVersion.findById(contract.solutionVersionId).lean();
    if (!sourceVersion) {
      logger.warn({ contractId }, "Cannot recalc: original version missing");
      return [];
    }
    version = await SolutionVersion.findOne({
      solutionId: sourceVersion.solutionId,
      validFrom: { $lte: at },
      $or: [{ validTo: null }, { validTo: { $gt: at } }],
    })
      .sort({ validFrom: -1 })
      .lean();
    if (!version) {
      logger.warn({ contractId }, "No active version at contract date");
      return [];
    }
  } else {
    version = await SolutionVersion.findById(contract.solutionVersionId).lean();
    if (!version) {
      logger.warn({ contractId }, "Cannot generate commissions: solution version not found");
      return [];
    }
  }
  const versionId = version._id;

  const created: CommissionHydrated[] = [];
  const period = derivePeriod(contract.signedAt ?? contract.createdAt);

  let agentCommissionCents = 0;
  if (contract.agentId && version.agentBp > 0) {
    agentCommissionCents = calcCommissionCents(contract.amountCents, version.agentBp);
    const c = await Commission.create({
      contractId,
      beneficiaryUserId: contract.agentId,
      beneficiaryRole: "AGENT",
      sourceEvent: "CONTRACT_SIGNED",
      amountCents: agentCommissionCents,
      currency: contract.currency,
      period,
      reason,
      metadata: {
        solutionVersionId: versionId,
        bp: version.agentBp,
        baseCents: contract.amountCents,
        baseKind: "CONTRACT_AMOUNT",
      },
    });
    created.push(c);
  }

  // Manager override is calculated on the AGENT commission, not the contract amount.
  // Additive — does not deduct from the agent.
  if (
    contract.managerId &&
    version.managerBp > 0 &&
    agentCommissionCents > 0
  ) {
    const managerCommissionCents = calcCommissionCents(
      agentCommissionCents,
      version.managerBp
    );
    const c = await Commission.create({
      contractId,
      beneficiaryUserId: contract.managerId,
      beneficiaryRole: "AREA_MANAGER",
      sourceEvent: "CONTRACT_SIGNED",
      amountCents: managerCommissionCents,
      currency: contract.currency,
      period,
      reason,
      metadata: {
        solutionVersionId: versionId,
        bp: version.managerBp,
        baseCents: agentCommissionCents,
        baseKind: "AGENT_COMMISSION",
      },
    });
    created.push(c);
  }

  return created;
}

function derivePeriod(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function recalculateContractsForSolution(
  solutionId: string,
  reason: string
): Promise<{ recalculated: number; skipped: number }> {
  const solutionVersionIds = await SolutionVersion.find({ solutionId }).distinct("_id");
  const contracts = await Contract.find({
    status: "SIGNED",
    solutionVersionId: { $in: solutionVersionIds },
  })
    .select("_id signedAt createdAt solutionVersionId")
    .limit(1_000);

  let recalculated = 0;
  let skipped = 0;
  for (const contract of contracts) {
    try {
      const at = contract.signedAt ?? contract.createdAt;
      const activeVersion = await SolutionVersion.findOne({
        solutionId,
        validFrom: { $lte: at },
        $or: [{ validTo: null }, { validTo: { $gt: at } }],
      })
        .sort({ validFrom: -1 })
        .lean();

      if (!activeVersion) {
        skipped++;
        continue;
      }

      const fresh = await generateForContract(contract._id.toString(), reason, {
        useActiveVersion: true,
      });
      const newIds = fresh.map((c) => c._id);
      await Commission.updateMany(
        { contractId: contract._id, supersededAt: null, _id: { $nin: newIds } },
        { supersededAt: new Date(), reason }
      );
      recalculated++;
    } catch (err) {
      logger.error({ err, contractId: contract._id }, "Failed to recalc contract");
      skipped++;
    }
  }

  logger.info({ solutionId, recalculated, skipped, reason }, "Solution-wide recalc complete");
  return { recalculated, skipped };
}

export async function recalculateForContract(contractId: string, reason: string) {
  const fresh = await generateForContract(contractId, reason);
  const newIds = fresh.map((c) => c._id);
  await Commission.updateMany(
    {
      contractId,
      supersededAt: null,
      _id: { $nin: newIds },
    },
    { supersededAt: new Date(), reason }
  );
  return fresh;
}

export async function supersedeForContract(contractId: string, reason: string) {
  const result = await Commission.updateMany(
    { contractId, supersededAt: null },
    { supersededAt: new Date(), reason }
  );
  return result.modifiedCount;
}

export async function totalEarnedCents(userId: string, opts: { period?: string } = {}) {
  const match: Record<string, unknown> = {
    beneficiaryUserId: new Types.ObjectId(userId),
    supersededAt: null,
  };
  if (opts.period) match.period = opts.period;
  const result = await Commission.aggregate<{ _id: null; total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amountCents" } } },
  ]);
  return result[0]?.total ?? 0;
}

export async function countActiveInstallationsForAgent(
  agentId: string,
  from: Date,
  to: Date
): Promise<number> {
  const { Installation } = await import("../installations/installation.model");
  return Installation.countDocuments({
    activatedAt: { $gte: from, $lt: to },
    contractId: {
      $in: await Contract.find({ agentId, status: "SIGNED" }).distinct("_id"),
    },
  });
}
