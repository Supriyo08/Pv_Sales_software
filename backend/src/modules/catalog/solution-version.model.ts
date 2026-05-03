import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const solutionVersionSchema = new Schema(
  {
    solutionId: { type: Schema.Types.ObjectId, ref: "Solution", required: true, index: true },
    validFrom: { type: Date, required: true, index: true },
    validTo: { type: Date, default: null, index: true },
    basePriceCents: { type: Number, required: true, min: 0 },
    // Per Review 1.0 §3: agents pick from a pre-defined range; out-of-range needs admin approval.
    // Null on either side = unbounded.
    minPriceCents: { type: Number, default: null, min: 0 },
    maxPriceCents: { type: Number, default: null, min: 0 },
    currency: { type: String, default: "EUR" },
    agentBp: { type: Number, required: true, min: 0, max: 10_000 },
    managerBp: { type: Number, required: true, min: 0, max: 10_000 },
    changeReason: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Per Review 1.0 §3: inventory control.
    // active=false: temporary deactivation (still readable for history; not selectable).
    // boundToUserIds/TerritoryIds/CustomerIds: empty array = no binding (everyone with the
    // active rule sees it). Non-empty = ONLY those targets see it.
    active: { type: Boolean, default: true, index: true },
    boundToUserIds: { type: [Schema.Types.ObjectId], default: [], ref: "User" },
    boundToTerritoryIds: { type: [Schema.Types.ObjectId], default: [], ref: "Territory" },
    boundToCustomerIds: { type: [Schema.Types.ObjectId], default: [], ref: "Customer" },
    // Per Review 1.2 (2026-05-04): pricing matrix mirroring the Figma board.
    // Each row overrides final price + commissions for a specific
    // (paymentMethod × installmentPlan × advance-range) combination. Empty
    // numeric fields fall back to the version's basePriceCents/agentBp/managerBp.
    // `*Pct` fields are alternative inputs expressed as percentages of the base
    // — at apply time the resolver converts them into cents/bp.
    pricingMatrix: {
      type: [
        new Schema(
          {
            label: { type: String, default: "" },
            paymentMethod: {
              type: String,
              enum: ["ONE_TIME", "ADVANCE_INSTALLMENTS", "FULL_INSTALLMENTS"],
              required: true,
            },
            installmentPlanId: {
              type: Schema.Types.ObjectId,
              ref: "InstallmentPlan",
              default: null,
            },
            advanceMinCents: { type: Number, default: null },
            advanceMaxCents: { type: Number, default: null },
            finalPriceCents: { type: Number, default: null },
            finalPricePct: { type: Number, default: null },
            agentBp: { type: Number, default: null, min: 0, max: 10_000 },
            agentPct: { type: Number, default: null },
            managerBp: { type: Number, default: null, min: 0, max: 10_000 },
            managerPct: { type: Number, default: null },
          },
          { _id: true, timestamps: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

solutionVersionSchema.index({ solutionId: 1, validFrom: -1 });
solutionVersionSchema.index({ active: 1, solutionId: 1 });

export type SolutionVersionDoc = InferSchemaType<typeof solutionVersionSchema> & {
  _id: Schema.Types.ObjectId;
};
export const SolutionVersion: Model<SolutionVersionDoc> = model<SolutionVersionDoc>(
  "SolutionVersion",
  solutionVersionSchema
);
