import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const templateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "" },
    body: { type: String, required: true },
    active: { type: Boolean, default: true, index: true },
    // Per Review 1.1 §2: templates can be assigned to specific solutions.
    // Empty array = applies to all solutions.
    solutionIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Solution" }],
      default: [],
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type ContractTemplateDoc = InferSchemaType<typeof templateSchema> & {
  _id: Schema.Types.ObjectId;
};
export const ContractTemplate: Model<ContractTemplateDoc> = model<ContractTemplateDoc>(
  "ContractTemplate",
  templateSchema
);
