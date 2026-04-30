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
