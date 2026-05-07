import { Schema, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Per Review 1.5 (2026-05-07): chat-style notes attached to customers and
 * contracts. Anyone with read access on the parent resource can post; every
 * note records its author and timestamp so the audit trail is intact.
 *
 * One collection covers both kinds via the `targetType` discriminator —
 * keeps queries simple and lets us add new note targets later (Lead, House,
 * Solution etc.) without another collection.
 */
export const NOTE_TARGETS = ["Customer", "Contract"] as const;
export type NoteTarget = (typeof NOTE_TARGETS)[number];

const noteSchema = new Schema(
  {
    targetType: {
      type: String,
      enum: NOTE_TARGETS,
      required: true,
      index: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

noteSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export type NoteDoc = InferSchemaType<typeof noteSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Note: Model<NoteDoc> = model<NoteDoc>("Note", noteSchema);
