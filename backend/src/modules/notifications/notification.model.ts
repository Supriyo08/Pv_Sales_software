import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const NOTIFICATION_KINDS = [
  "CONTRACT_SIGNED",
  "CONTRACT_CANCELLED",
  "INSTALLATION_ACTIVATED",
  "BONUS_CALCULATED",
  "PAYMENT_CREATED",
  "PAYMENT_DISPUTED",
  // Per Review 1.1 §1: contract edit-request workflow.
  "CONTRACT_EDIT_REQUESTED",
  "CONTRACT_EDIT_APPROVED",
  "CONTRACT_EDIT_REJECTED",
  // Per Review 1.1 §1: generation approval gate before agent can sign/print.
  "CONTRACT_GENERATION_REQUESTED",
  "CONTRACT_GENERATION_APPROVED",
  // Per Review 1.1 §8: AM advance-payment authorization.
  "ADVANCE_PAY_AUTH_REQUESTED",
  "ADVANCE_PAY_AUTH_DECIDED",
  // Per Review 1.1 §7: bonus/commission reversal review needed.
  "REVERSAL_REVIEW_CREATED",
] as const;

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    payload: { type: Schema.Types.Mixed, default: null },
    readAt: { type: Date, default: null, index: true },
    sentVia: { type: [String], default: ["IN_APP"] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Notification: Model<NotificationDoc> = model<NotificationDoc>(
  "Notification",
  notificationSchema
);
