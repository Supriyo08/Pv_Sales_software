import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const REVERSAL_REVIEW_KINDS = ["COMMISSION", "BONUS"] as const;
export type ReversalReviewKind = (typeof REVERSAL_REVIEW_KINDS)[number];

export const REVERSAL_REVIEW_STATUSES = ["PENDING", "DECIDED"] as const;
export type ReversalReviewStatus = (typeof REVERSAL_REVIEW_STATUSES)[number];

export const REVERSAL_REVIEW_DECISIONS = ["KEEP", "REVERT", "REDUCE"] as const;
export type ReversalReviewDecision = (typeof REVERSAL_REVIEW_DECISIONS)[number];

/**
 * Per Review 1.1 §7: when an installation backing an already-paid commission or
 * bonus is later cancelled, we never auto-revert. Instead we create a
 * ReversalReview, notify admin, and let them choose:
 *   - KEEP: leave the commission/bonus as is (the AM/admin took responsibility).
 *   - REVERT: supersede the row (refund recovery handled outside the system).
 *   - REDUCE: supersede + create a smaller replacement.
 */
const reversalReviewSchema = new Schema(
  {
    kind: { type: String, enum: REVERSAL_REVIEW_KINDS, required: true, index: true },
    // Subject is either a Commission._id or a Bonus._id depending on kind.
    subjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
      index: true,
    },
    installationId: {
      type: Schema.Types.ObjectId,
      ref: "Installation",
      required: true,
      index: true,
    },
    beneficiaryUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    period: { type: String, default: null, index: true },
    suggestedAction: {
      type: String,
      enum: REVERSAL_REVIEW_DECISIONS,
      default: "REVERT",
    },
    amountCents: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
    status: {
      type: String,
      enum: REVERSAL_REVIEW_STATUSES,
      default: "PENDING",
      index: true,
    },
    decision: {
      type: String,
      enum: REVERSAL_REVIEW_DECISIONS,
      default: null,
    },
    reduceCents: { type: Number, default: null },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },
  },
  { timestamps: true }
);

reversalReviewSchema.index({ status: 1, createdAt: -1 });

export type ReversalReviewDoc = InferSchemaType<typeof reversalReviewSchema> & {
  _id: Schema.Types.ObjectId;
};
export const ReversalReview: Model<ReversalReviewDoc> = model<ReversalReviewDoc>(
  "ReversalReview",
  reversalReviewSchema
);
