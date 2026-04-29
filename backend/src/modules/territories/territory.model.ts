import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const territorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Territory", default: null, index: true },
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

territorySchema.index({ deletedAt: 1 });

export type TerritoryDoc = InferSchemaType<typeof territorySchema> & { _id: Schema.Types.ObjectId };
export const Territory: Model<TerritoryDoc> = model<TerritoryDoc>("Territory", territorySchema);
