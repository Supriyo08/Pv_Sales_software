import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const solutionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "" },
    // Per Review 1.1 §3: deactivate (still visible to admin, hidden from agents)
    // OR archive (soft-delete via deletedAt, hidden everywhere). Keep both controls
    // separate so admins can re-activate a paused solution without un-archiving.
    active: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type SolutionDoc = InferSchemaType<typeof solutionSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Solution: Model<SolutionDoc> = model<SolutionDoc>("Solution", solutionSchema);
