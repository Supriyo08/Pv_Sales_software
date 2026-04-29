import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const bonusSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    period: { type: String, required: true, index: true },
    ruleId: { type: Schema.Types.ObjectId, ref: "BonusRule", required: true },
    qualifierCount: { type: Number, required: true },
    baseAmountCents: { type: Number, required: true },
    basisPoints: { type: Number, required: true },
    bonusAmountCents: { type: Number, required: true },
    commissionId: { type: Schema.Types.ObjectId, ref: "Commission", required: true },
  },
  { timestamps: true }
);

bonusSchema.index({ userId: 1, period: 1, ruleId: 1 }, { unique: true });

export type BonusDoc = InferSchemaType<typeof bonusSchema> & { _id: Schema.Types.ObjectId };
export const Bonus: Model<BonusDoc> = model<BonusDoc>("Bonus", bonusSchema);
