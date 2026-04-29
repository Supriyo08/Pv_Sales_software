import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import { USER_ROLES } from "../users/user.model";

export const BONUS_CONDITIONS = [
  "AGENT_INSTALLATIONS_GTE",
  "NETWORK_INSTALLATIONS_GTE",
] as const;
export type BonusCondition = (typeof BONUS_CONDITIONS)[number];

const bonusRuleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    conditionType: { type: String, enum: BONUS_CONDITIONS, required: true },
    threshold: { type: Number, required: true, min: 0 },
    basisPoints: { type: Number, required: true, min: 0, max: 10_000 },
    validFrom: { type: Date, required: true, index: true },
    validTo: { type: Date, default: null, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type BonusRuleDoc = InferSchemaType<typeof bonusRuleSchema> & {
  _id: Schema.Types.ObjectId;
};
export const BonusRule: Model<BonusRuleDoc> = model<BonusRuleDoc>("BonusRule", bonusRuleSchema);
