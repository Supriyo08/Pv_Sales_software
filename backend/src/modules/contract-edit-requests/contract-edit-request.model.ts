import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const EDIT_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type EditRequestStatus = (typeof EDIT_REQUEST_STATUSES)[number];

/**
 * Per Review 1.1 §1: agents cannot edit a contract directly after creation; they
 * submit a ContractEditRequest with the desired changes and admin/AM applies them
 * after review. Whitelist of editable fields is enforced in the service layer.
 */
const editRequestSchema = new Schema(
  {
    contractId: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
      index: true,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Free-form bag — service whitelists keys to: amountCents, paymentMethod,
    // advanceCents, installmentPlanId, solutionVersionId. Storing as Mixed so
    // the frontend doesn't need to know every editable field.
    changes: { type: Schema.Types.Mixed, default: {} },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: EDIT_REQUEST_STATUSES,
      default: "PENDING",
      index: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: "" },
  },
  { timestamps: true }
);

editRequestSchema.index({ contractId: 1, status: 1, createdAt: -1 });

export type ContractEditRequestDoc = InferSchemaType<typeof editRequestSchema> & {
  _id: Schema.Types.ObjectId;
};
export const ContractEditRequest: Model<ContractEditRequestDoc> = model<ContractEditRequestDoc>(
  "ContractEditRequest",
  editRequestSchema
);
