import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const PAYMENT_STATUSES = [
  "PENDING",
  "PARTIAL",
  "FULL",
  "DISPUTED",
  "CANCELLED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    period: { type: String, required: true, index: true },
    totalAmountCents: { type: Number, required: true, min: 0 },
    paidCents: { type: Number, default: 0 },
    currency: { type: String, default: "EUR" },
    status: { type: String, enum: PAYMENT_STATUSES, default: "PENDING", index: true },
    cancelled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, period: 1 }, { unique: true });

export type PaymentDoc = InferSchemaType<typeof paymentSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Payment: Model<PaymentDoc> = model<PaymentDoc>("Payment", paymentSchema);
