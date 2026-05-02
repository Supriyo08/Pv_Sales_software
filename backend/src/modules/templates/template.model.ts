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
    // Per follow-up to Review 1.1 (2026-05-02): when a template is uploaded as
    // .docx we keep the original file on disk so generation produces a .docx
    // that mirrors the source's exact visual formatting. `body` still holds the
    // mammoth-extracted HTML for editor preview + placeholder analysis.
    sourceDocxPath: { type: String, default: null },
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
