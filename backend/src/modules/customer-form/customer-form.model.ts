import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const CUSTOMER_FIELD_TYPES = [
  "text",
  "email",
  "tel",
  "date",
  "number",
  "select",
  "textarea",
] as const;
export type CustomerFieldType = (typeof CUSTOMER_FIELD_TYPES)[number];

const fieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: CUSTOMER_FIELD_TYPES, required: true },
    required: { type: Boolean, default: false },
    placeholder: { type: String, default: "" },
    helpText: { type: String, default: "" },
    options: { type: [String], default: [] }, // for select
    builtin: { type: Boolean, default: false }, // pre-existing fields like fiscalCode/fullName
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const customerFormSchema = new Schema(
  {
    // Singleton — there's at most one row identified by `singleton: true`.
    singleton: { type: Boolean, default: true, unique: true },
    fields: { type: [fieldSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export type CustomerFormConfigDoc = InferSchemaType<typeof customerFormSchema> & {
  _id: Schema.Types.ObjectId;
};
export const CustomerFormConfig: Model<CustomerFormConfigDoc> = model<CustomerFormConfigDoc>(
  "CustomerFormConfig",
  customerFormSchema
);

// Builtin fields shipped with the system. Admins can add more, but the builtins
// are always present (UI hides delete on these).
export const BUILTIN_FIELDS = [
  { key: "fiscalCode", label: "Fiscal code", type: "text" as const, required: true, builtin: true, order: 10 },
  { key: "fullName", label: "Full name", type: "text" as const, required: true, builtin: true, order: 20 },
  { key: "email", label: "Email", type: "email" as const, required: false, builtin: true, order: 30 },
  { key: "phone", label: "Phone", type: "tel" as const, required: false, builtin: true, order: 40 },
];
