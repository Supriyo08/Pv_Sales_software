import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const NOTIFICATION_KINDS = [
  "CONTRACT_SIGNED",
  "CONTRACT_CANCELLED",
  "INSTALLATION_ACTIVATED",
  "BONUS_CALCULATED",
  "PAYMENT_CREATED",
  "PAYMENT_DISPUTED",
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
