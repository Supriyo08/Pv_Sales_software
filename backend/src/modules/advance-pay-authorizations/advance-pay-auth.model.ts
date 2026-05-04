import { Schema, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Per Review 1.2 (2026-05-04): advance-pay authorization is now a TWO-STAGE
 * flow. The agent's commission only fires early when both:
 *
 *   1. the assigned area manager approves, AND
 *   2. the admin then approves.
 *
 * If either party declines, the request terminates and commission is deferred
 * until installation is activated (the standard, lower-risk path). When the
 * manager declines, it does NOT escalate to admin.
 *
 * Legacy v1.1 statuses (PENDING / AUTHORIZED / DECLINED) are retained in the
 * enum so existing rows keep loading; new rows use the *_MANAGER / *_ADMIN
 * variants and the service layer treats PENDING as PENDING_MANAGER.
 */
export const ADVANCE_AUTH_STATUSES = [
  "PENDING", // legacy alias for PENDING_MANAGER
  "PENDING_MANAGER",
  "PENDING_ADMIN",
  "AUTHORIZED",
  "DECLINED", // legacy alias for DECLINED_BY_MANAGER
  "DECLINED_BY_MANAGER",
  "DECLINED_BY_ADMIN",
  // Per Review 1.1 §8: when installation activates and no decision exists,
  // we mark the auth as RESOLVED_BY_INSTALL — commissions auto-fire.
  "RESOLVED_BY_INSTALL",
] as const;
export type AdvanceAuthStatus = (typeof ADVANCE_AUTH_STATUSES)[number];

const advancePayAuthSchema = new Schema(
  {
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
      index: true,
      // One authorization per contract — re-approving the contract does not
      // create new ones.
      unique: true,
    },
    requestedAt: { type: Date, default: () => new Date() },
    status: {
      type: String,
      enum: ADVANCE_AUTH_STATUSES,
      default: "PENDING_MANAGER",
      index: true,
    },
    // Stage 1: assigned area manager.
    managerDecidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    managerDecidedAt: { type: Date, default: null },
    managerDecision: {
      type: String,
      enum: ["APPROVED", "DECLINED"],
      default: null,
    },
    managerNote: { type: String, default: "" },
    // Stage 2: admin (only relevant once manager has approved).
    adminDecidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    adminDecidedAt: { type: Date, default: null },
    adminDecision: {
      type: String,
      enum: ["APPROVED", "DECLINED"],
      default: null,
    },
    adminNote: { type: String, default: "" },
    // Legacy denormalised "last decision" fields — kept so audit log + v1.1
    // consumers continue to work. Populated on every decide.
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

export type AdvancePayAuthDoc = InferSchemaType<typeof advancePayAuthSchema> & {
  _id: Schema.Types.ObjectId;
};
export const AdvancePayAuthorization: Model<AdvancePayAuthDoc> = model<AdvancePayAuthDoc>(
  "AdvancePayAuthorization",
  advancePayAuthSchema
);
