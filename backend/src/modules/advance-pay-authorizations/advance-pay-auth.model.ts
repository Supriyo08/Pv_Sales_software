import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const ADVANCE_AUTH_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "DECLINED",
  // Per Review 1.1 §8: when installation activates and no AM decision exists,
  // we mark the auth as RESOLVED_BY_INSTALL — commissions auto-fire on the
  // installation event (the lower-risk path).
  "RESOLVED_BY_INSTALL",
] as const;
export type AdvanceAuthStatus = (typeof ADVANCE_AUTH_STATUSES)[number];

/**
 * Per Review 1.1 §8 ("Others — New functions"): after admin/AM approves the
 * signed contract, a separate authorization request goes to the area manager.
 * If they authorize, the agent's commission is paid early (AM takes
 * responsibility for refunds if installation later fails). If they decline (or
 * never decide), commission is deferred until installation is activated.
 */
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
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ADVANCE_AUTH_STATUSES,
      default: "PENDING",
      index: true,
    },
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
