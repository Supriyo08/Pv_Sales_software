import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const PRICING_VARIABLES = ["panels", "battery"] as const;
export type PricingVariable = (typeof PRICING_VARIABLES)[number];

const stepRuleSchema = new Schema(
  {
    variable: { type: String, enum: PRICING_VARIABLES, required: true },
    // Threshold in kWh (>=). When the input variable's value is greater than `thresholdKwh`,
    // `addCents` is added to the total.
    thresholdKwh: { type: Number, required: true, min: 0 },
    addCents: { type: Number, required: true },
    label: { type: String, default: "" },
  },
  { _id: false }
);

const pricingFormulaSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "" },
    // Base price per kWh of solar panels (e.g. €2,000/kWh -> 200_000 cents).
    panelsBasePerKwhCents: { type: Number, required: true, min: 0 },
    // Base price per kWh of storage battery.
    batteryBasePerKwhCents: { type: Number, required: true, min: 0 },
    // Non-linear step jumps. Evaluated in declaration order.
    stepRules: { type: [stepRuleSchema], default: [] },
    currency: { type: String, default: "EUR" },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type PricingFormulaDoc = InferSchemaType<typeof pricingFormulaSchema> & {
  _id: Schema.Types.ObjectId;
};
export const PricingFormula: Model<PricingFormulaDoc> = model<PricingFormulaDoc>(
  "PricingFormula",
  pricingFormulaSchema
);
