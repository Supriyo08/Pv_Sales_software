import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const TRANSACTION_KINDS = ["PAY", "REFUND", "DISPUTE", "RESOLVE_DISPUTE"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export const PAYMENT_METHODS = ["WIRE", "CASH", "CHECK", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const transactionSchema = new Schema(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
    kind: { type: String, enum: TRANSACTION_KINDS, required: true },
    amountCents: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_METHODS, default: null },
    referenceNumber: { type: String, default: null, trim: true },
    executedAt: { type: Date, required: true, default: () => new Date() },
    proofUrl: { type: String, default: null },
    notes: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ referenceNumber: 1 }, { sparse: true });

export type TransactionDoc = InferSchemaType<typeof transactionSchema> & {
  _id: Schema.Types.ObjectId;
};
export const PaymentTransaction: Model<TransactionDoc> = model<TransactionDoc>(
  "PaymentTransaction",
  transactionSchema
);
