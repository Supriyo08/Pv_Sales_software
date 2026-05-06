import { Schema, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Per Review 1.5 (2026-05-04): "Notes over customer — A chat with everyone can
 * write notes over the customer. It will be shown who wrote the note and the
 * note text." A separate collection keeps it append-only and lets us paginate
 * + audit independently of the Customer document.
 */
const customerNoteSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

customerNoteSchema.index({ customerId: 1, createdAt: -1 });

export type CustomerNoteDoc = InferSchemaType<typeof customerNoteSchema> & {
  _id: Schema.Types.ObjectId;
};
export const CustomerNote: Model<CustomerNoteDoc> = model<CustomerNoteDoc>(
  "CustomerNote",
  customerNoteSchema
);
