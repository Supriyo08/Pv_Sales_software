import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const CONTRACT_STATUSES = ["DRAFT", "SIGNED", "CANCELLED"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "ONE_TIME",
  "ADVANCE_INSTALLMENTS",
  "FULL_INSTALLMENTS",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

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
    // Per Review 1.0 §3,§6: payment method affects commission base
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "ONE_TIME",
      index: true,
    },
    advanceCents: { type: Number, default: 0, min: 0 }, // for ADVANCE_INSTALLMENTS
    installmentPlanId: {
      type: Schema.Types.ObjectId,
      ref: "InstallmentPlan",
      default: null,
    },
    installmentMonths: { type: Number, default: null }, // denormalised from plan at creation
    installmentAmountCents: { type: Number, default: null }, // derived
    status: { type: String, enum: CONTRACT_STATUSES, default: "DRAFT", index: true },
    signedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: "" },
    // Per Review 1.0 §5: All contracts must be approved by an Admin or Area Manager.
    // signedScanDocumentId — the uploaded customer-signed scan; required before approval.
    // approvedAt / approvedBy — set when admin/AM verifies. Commissions only fire on approval
    // (when approvalRequired=true); legacy contracts with approvalRequired=false fire on sign().
    approvalRequired: { type: Boolean, default: true },
    signedScanDocumentId: { type: Schema.Types.ObjectId, ref: "Document", default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

contractSchema.index({ status: 1, signedAt: -1 });
contractSchema.index({ agentId: 1, status: 1 });

export type ContractDoc = InferSchemaType<typeof contractSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Contract: Model<ContractDoc> = model<ContractDoc>("Contract", contractSchema);
