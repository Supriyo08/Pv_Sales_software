import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const CONTRACT_STATUSES = ["DRAFT", "SIGNED", "CANCELLED"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const contractSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    territoryId: { type: Schema.Types.ObjectId, ref: "Territory", default: null, index: true },
    solutionVersionId: {
      type: Schema.Types.ObjectId,
      ref: "SolutionVersion",
      required: true,
    },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    status: { type: String, enum: CONTRACT_STATUSES, default: "DRAFT", index: true },
    signedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: "" },
  },
  { timestamps: true }
);

contractSchema.index({ status: 1, signedAt: -1 });
contractSchema.index({ agentId: 1, status: 1 });

export type ContractDoc = InferSchemaType<typeof contractSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Contract: Model<ContractDoc> = model<ContractDoc>("Contract", contractSchema);
