import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const PRICE_APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type PriceApprovalStatus = (typeof PRICE_APPROVAL_STATUSES)[number];

const priceApprovalSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    solutionVersionId: {
      type: Schema.Types.ObjectId,
      ref: "SolutionVersion",
      required: true,
    },
    requestedAmountCents: { type: Number, required: true, min: 0 },
    minPriceCents: { type: Number, default: null },
    maxPriceCents: { type: Number, default: null },
    note: { type: String, default: "" },
    status: {
      type: String,
      enum: PRICE_APPROVAL_STATUSES,
      default: "PENDING",
      index: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },
    contractId: { type: Schema.Types.ObjectId, ref: "Contract", default: null },
  },
  { timestamps: true }
);

priceApprovalSchema.index({ status: 1, createdAt: -1 });

export type PriceApprovalDoc = InferSchemaType<typeof priceApprovalSchema> & {
  _id: Schema.Types.ObjectId;
};
export const PriceApprovalRequest: Model<PriceApprovalDoc> = model<PriceApprovalDoc>(
  "PriceApprovalRequest",
  priceApprovalSchema
);
