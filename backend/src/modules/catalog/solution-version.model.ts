import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const solutionVersionSchema = new Schema(
  {
    solutionId: { type: Schema.Types.ObjectId, ref: "Solution", required: true, index: true },
    validFrom: { type: Date, required: true, index: true },
    validTo: { type: Date, default: null, index: true },
    basePriceCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    agentBp: { type: Number, required: true, min: 0, max: 10_000 },
    managerBp: { type: Number, required: true, min: 0, max: 10_000 },
    changeReason: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

solutionVersionSchema.index({ solutionId: 1, validFrom: -1 });

export type SolutionVersionDoc = InferSchemaType<typeof solutionVersionSchema> & {
  _id: Schema.Types.ObjectId;
};
export const SolutionVersion: Model<SolutionVersionDoc> = model<SolutionVersionDoc>(
  "SolutionVersion",
  solutionVersionSchema
);
