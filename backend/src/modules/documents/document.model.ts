import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const DOCUMENT_OWNER_TYPES = ["Customer", "Contract", "Installation", "User"] as const;
export const DOCUMENT_KINDS = [
  "ID_CARD",
  "CONTRACT_PDF",
  // Per Review 1.1 §1: agent-generated draft awaiting admin approval before sign/print.
  "CONTRACT_DRAFT",
  "BILL",
  "PERMIT",
  "PROOF_OF_PAYMENT",
  "OTHER",
] as const;

const documentSchema = new Schema(
  {
    ownerType: { type: String, enum: DOCUMENT_OWNER_TYPES, required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, default: "application/octet-stream" },
    sizeBytes: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

documentSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });

export type DocumentDoc = InferSchemaType<typeof documentSchema> & {
  _id: Schema.Types.ObjectId;
};
export const PvDocument: Model<DocumentDoc> = model<DocumentDoc>("Document", documentSchema);
