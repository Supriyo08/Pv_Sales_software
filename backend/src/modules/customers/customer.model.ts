import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const addressSchema = new Schema(
  {
    line1: { type: String, default: "" },
    line2: { type: String, default: "" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    country: { type: String, default: "IT" },
  },
  { _id: false }
);

const customerSchema = new Schema(
  {
    fiscalCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    address: { type: addressSchema, default: () => ({}) },
    // Per Review 1.0 §2: customer ownership for visibility scoping + reassignment.
    // Null = unassigned (visible only to admins). Set on create + via PATCH /:id/assign.
    assignedAgentId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    // Per Review 1.0 §8: admins can customise the New Customer form. Free-form
    // key/value bag for any non-builtin fields the form schema declares.
    customFields: { type: Schema.Types.Mixed, default: {} },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

customerSchema.index({ fullName: "text", email: 1 });
customerSchema.index({ assignedAgentId: 1, deletedAt: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Customer: Model<CustomerDoc> = model<CustomerDoc>("Customer", customerSchema);
