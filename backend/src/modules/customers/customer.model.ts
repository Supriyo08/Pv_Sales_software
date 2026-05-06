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
    // Per Review 1.5 (2026-05-04): customer record now distinguishes first
    // name and surname per the "Name/Surname mandatory at create" rule. The
    // legacy `fullName` is kept for back-compat (search index, old contracts)
    // and computed from firstName + surname when provided.
    // Index defined explicitly below as a partial-unique — no `index: true`
    // here to avoid the "duplicate schema index" Mongoose warning.
    fiscalCode: { type: String, default: "", uppercase: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    firstName: { type: String, default: "", trim: true },
    surname: { type: String, default: "", trim: true },
    /** Birth date — Review 1.5 §"Client_Birth_Place [Date input]". */
    birthDate: { type: Date, default: null },
    email: { type: String, default: "", lowercase: true, trim: true },
    /** Per Review 1.5: PEC email — optional at create, mandatory before
     *  installation planning. Validated server-side. */
    pecEmail: { type: String, default: "", lowercase: true, trim: true },
    /** Cellphone (validated as international or IT national format). */
    phone: { type: String, default: "", trim: true },
    cellphone: { type: String, default: "", trim: true },
    /** Per Review 1.5 §"User Documents": ID card number + expiry. The
     *  card photos themselves are stored as Document records linked to the
     *  customer (kind="ID_CARD"). */
    idNumber: { type: String, default: "", trim: true },
    idExpireDate: { type: Date, default: null },
    address: { type: addressSchema, default: () => ({}) },
    // Per Review 1.0 §2: customer ownership for visibility scoping + reassignment.
    // Null = unassigned (visible only to admins). Set on create + via PATCH /:id/assign.
    assignedAgentId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    // Per Review 1.0 §8: admins can customise the New Customer form. Free-form
    // key/value bag for any non-builtin fields the form schema declares.
    customFields: { type: Schema.Types.Mixed, default: {} },
    // Per Review 1.1 §6 clarifications: when admin reassigns a customer/lead,
    // they may configure how future commissions are split between agents and
    // which AM gets the bonus count + override. Null = no split (single agent
    // flow as before). agentSplits sum must equal 10000 bp (100%).
    commissionSplit: {
      type: new Schema(
        {
          agentSplits: [
            {
              _id: false,
              userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
              bp: { type: Number, min: 0, max: 10_000, required: true },
            },
          ],
          bonusCountBeneficiaryId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
          },
          managerBonusBeneficiaryId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
          },
          managerOverrideBeneficiaryId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
          },
        },
        { _id: false }
      ),
      default: null,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

customerSchema.index({ fullName: "text", surname: "text", email: 1 });
customerSchema.index({ assignedAgentId: 1, deletedAt: 1 });
// Drop the old `unique: true` on fiscalCode — Review 1.5 makes it optional.
// We still want a partial-unique index so two customers can't share a non-empty
// codice fiscale, but nulls/empties are allowed.
customerSchema.index(
  { fiscalCode: 1 },
  { unique: true, partialFilterExpression: { fiscalCode: { $type: "string", $ne: "" } } }
);

export type CustomerDoc = InferSchemaType<typeof customerSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Customer: Model<CustomerDoc> = model<CustomerDoc>("Customer", customerSchema);
