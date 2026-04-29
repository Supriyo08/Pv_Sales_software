import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const LEAD_STATUSES = ["NEW", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const leadSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    source: { type: String, default: "" },
    status: { type: String, enum: LEAD_STATUSES, default: "NEW", index: true },
    expectedClose: { type: Date, default: null },
    notes: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

leadSchema.index({ status: 1, agentId: 1 });

export type LeadDoc = InferSchemaType<typeof leadSchema> & { _id: Schema.Types.ObjectId };
export const Lead: Model<LeadDoc> = model<LeadDoc>("Lead", leadSchema);
