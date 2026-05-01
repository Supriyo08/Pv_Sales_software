import {
  ReversalReview,
  type ReversalReviewDecision,
  type ReversalReviewStatus,
} from "./reversal-review.model";
import { Commission } from "../commissions/commission.model";
import { Bonus } from "../bonuses/bonus.model";
import { Contract } from "../contracts/contract.model";
import { Installation } from "../installations/installation.model";
import type { Scope } from "../../lib/scope";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";
import { logger } from "../../utils/logger";

function periodFor(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Per Review 1.1 §7: when an installation is cancelled, find every commission
 * and bonus that depended on it (active rows only — already-superseded rows are
 * already accounted for) and queue a ReversalReview for each. Idempotent —
 * existing pending reviews for the same subject are not duplicated.
 */
export async function createForInstallation(installationId: string): Promise<number> {
  const inst = await Installation.findById(installationId);
  if (!inst) return 0;

  const contract = await Contract.findById(inst.contractId);
  if (!contract) return 0;

  // The most recent ACTIVATED milestone tells us which period the bonus would
  // have been counted in (we just cleared `activatedAt`).
  const activatedMilestone = [...inst.milestones]
    .reverse()
    .find((m) => m.status === "ACTIVATED");
  const activatedPeriod = activatedMilestone
    ? periodFor(activatedMilestone.date)
    : null;

  let created = 0;

  // 1) Active commissions tied to this contract.
  const activeCommissions = await Commission.find({
    contractId: contract._id,
    supersededAt: null,
  });
  for (const c of activeCommissions) {
    const exists = await ReversalReview.findOne({
      kind: "COMMISSION",
      subjectId: c._id,
      status: "PENDING",
    });
    if (exists) continue;
    const review = await ReversalReview.create({
      kind: "COMMISSION",
      subjectId: c._id,
      contractId: contract._id,
      installationId: inst._id,
      beneficiaryUserId: c.beneficiaryUserId,
      period: c.period,
      amountCents: c.amountCents,
      currency: c.currency,
    });
    events.emit("reversal_review.created", {
      reviewId: review._id.toString(),
      contractId: contract._id.toString(),
      kind: "COMMISSION",
    });
    created++;
  }

  // 2) Bonuses for the period the installation activated in, for the agent or
  //    manager linked to this contract. Bonuses don't directly reference an
  //    installation, but their qualifier count was based on it.
  if (activatedPeriod) {
    const userIds = [contract.agentId, contract.managerId].filter(Boolean);
    const bonuses = await Bonus.find({
      period: activatedPeriod,
      userId: { $in: userIds },
    });
    for (const b of bonuses) {
      const exists = await ReversalReview.findOne({
        kind: "BONUS",
        subjectId: b._id,
        status: "PENDING",
      });
      if (exists) continue;
      const review = await ReversalReview.create({
        kind: "BONUS",
        subjectId: b._id,
        contractId: contract._id,
        installationId: inst._id,
        beneficiaryUserId: b.userId,
        period: b.period,
        amountCents: b.bonusAmountCents,
      });
      events.emit("reversal_review.created", {
        reviewId: review._id.toString(),
        contractId: contract._id.toString(),
        kind: "BONUS",
      });
      created++;
    }
  }

  logger.info({ installationId, created }, "Reversal reviews created");
  return created;
}

export async function list(
  filter: { status?: ReversalReviewStatus; kind?: string },
  _scope: Scope
) {
  const q: Record<string, unknown> = {};
  if (filter.status) q.status = filter.status;
  if (filter.kind) q.kind = filter.kind;
  return ReversalReview.find(q).sort({ createdAt: -1 }).limit(200);
}

export async function getById(id: string) {
  const r = await ReversalReview.findById(id);
  if (!r) throw new HttpError(404, "Reversal review not found");
  return r;
}

/**
 * Per Review 1.1 §7: admin chooses what happens to the affected commission/bonus.
 * - KEEP: just mark reviewed (admin took responsibility, e.g. AM authorized
 *   advance payment and is on the hook).
 * - REVERT: supersede the row entirely (refund recovery is out of scope here —
 *   typically handled by deducting from the user's next payment).
 * - REDUCE: supersede the original and create a new row at `reduceCents`.
 */
export async function decide(
  id: string,
  decision: ReversalReviewDecision,
  reduceCents: number | null,
  deciderId: string,
  note: string
) {
  const review = await getById(id);
  if (review.status !== "PENDING") {
    throw new HttpError(400, "Reversal review already decided");
  }
  if (decision === "REDUCE") {
    if (reduceCents === null || reduceCents === undefined) {
      throw new HttpError(400, "reduceCents required for REDUCE decision");
    }
    if (reduceCents < 0 || reduceCents >= review.amountCents) {
      throw new HttpError(
        400,
        `reduceCents must be 0..${review.amountCents - 1} (smaller than the original amount)`
      );
    }
  }

  const supersedeReason = `reversal review ${review._id} ${decision} (${note || "no note"})`;

  if (decision === "REVERT" || decision === "REDUCE") {
    if (review.kind === "COMMISSION") {
      const original = await Commission.findById(review.subjectId);
      if (original) {
        original.supersededAt = new Date();
        original.reason = supersedeReason;
        await original.save();
        if (decision === "REDUCE" && reduceCents !== null) {
          await Commission.create({
            contractId: original.contractId,
            beneficiaryUserId: original.beneficiaryUserId,
            beneficiaryRole: original.beneficiaryRole,
            sourceEvent: original.sourceEvent,
            amountCents: reduceCents,
            currency: original.currency,
            period: original.period,
            reason: `reduced via reversal review ${review._id}`,
            metadata: {
              ...original.metadata,
              reducedFromCents: original.amountCents,
              reversalReviewId: review._id.toString(),
            },
          });
        }
      }
    } else if (review.kind === "BONUS") {
      const original = await Bonus.findById(review.subjectId);
      if (original) {
        // Bonuses don't have supersededAt; we delete the bonus + supersede the
        // associated commission in lockstep. The commissionId on the bonus is
        // the canonical record of the payout.
        const linkedCommission = await Commission.findById(original.commissionId);
        if (linkedCommission) {
          linkedCommission.supersededAt = new Date();
          linkedCommission.reason = supersedeReason;
          await linkedCommission.save();
          if (decision === "REDUCE" && reduceCents !== null) {
            await Commission.create({
              contractId: linkedCommission.contractId,
              beneficiaryUserId: linkedCommission.beneficiaryUserId,
              beneficiaryRole: linkedCommission.beneficiaryRole,
              sourceEvent: linkedCommission.sourceEvent,
              amountCents: reduceCents,
              currency: linkedCommission.currency,
              period: linkedCommission.period,
              reason: `reduced via reversal review ${review._id}`,
              metadata: {
                ...linkedCommission.metadata,
                reducedFromCents: linkedCommission.amountCents,
                reversalReviewId: review._id.toString(),
              },
            });
          }
        }
        await Bonus.deleteOne({ _id: original._id });
      }
    }
  }

  review.status = "DECIDED";
  review.decision = decision;
  review.reduceCents = decision === "REDUCE" ? reduceCents : null;
  review.decidedBy = deciderId as unknown as typeof review.decidedBy;
  review.decidedAt = new Date();
  review.decisionNote = note;
  await review.save();
  return review;
}

export async function pendingCount(): Promise<number> {
  return ReversalReview.countDocuments({ status: "PENDING" });
}
