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
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

customerSchema.index({ fullName: "text", email: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Customer: Model<CustomerDoc> = model<CustomerDoc>("Customer", customerSchema);
