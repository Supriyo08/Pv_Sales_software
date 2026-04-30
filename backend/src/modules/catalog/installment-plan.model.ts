import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const installmentPlanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    months: { type: Number, required: true, min: 1, max: 240 },
    // Surcharge (cost of deferred payment) — used to reduce the commission base
    // when full-installments is selected. Stored in basis points (10000 = 100%).
    surchargeBp: { type: Number, required: true, min: 0, max: 10_000, default: 0 },
    description: { type: String, default: "" },
    active: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type InstallmentPlanDoc = InferSchemaType<typeof installmentPlanSchema> & {
  _id: Schema.Types.ObjectId;
};
export const InstallmentPlan: Model<InstallmentPlanDoc> = model<InstallmentPlanDoc>(
  "InstallmentPlan",
  installmentPlanSchema
);
