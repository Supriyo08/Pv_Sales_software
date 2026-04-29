import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const solutionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type SolutionDoc = InferSchemaType<typeof solutionSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Solution: Model<SolutionDoc> = model<SolutionDoc>("Solution", solutionSchema);
