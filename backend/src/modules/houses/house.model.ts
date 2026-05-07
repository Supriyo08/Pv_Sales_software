import { Schema, model, type InferSchemaType, type Model } from "mongoose";

/**
 * Per Review 1.5 (2026-05-07): a customer can have one or more houses (the
 * spec calls this out explicitly). Each house captures:
 *   - living address (Road & number, City, Postal Code, Province)
 *   - catastal details (sheet, particel, sub, reference number) — these are
 *     the Italian land-registry identifiers we need on the contract
 *   - property document references (PropertyDocument + photos, free count)
 *
 * Catastal fields are all optional at create time — the agent fulfills them
 * progressively. Frontend renders an "Incomplete" badge until at least the
 * Sheet / Particel pair is filled.
 */
const addressSchema = new Schema(
  {
    line1: { type: String, default: "" },
    city: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    region: { type: String, default: "" },
  },
  { _id: false }
);

const catastalSchema = new Schema(
  {
    sheet: { type: String, default: "" },
    particel: { type: String, default: "" },
    sub: { type: String, default: "" },
    reference: { type: String, default: "" },
  },
  { _id: false }
);

const houseSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    label: { type: String, default: "" }, // optional alias e.g. "primary residence"
    address: { type: addressSchema, default: () => ({}) },
    catastal: { type: catastalSchema, default: () => ({}) },
    // PropertyDocument + photos are stored via the existing Document module
    // with `ownerType: "House"` so the same upload pipeline serves them.
    propertyDocumentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

houseSchema.index({ customerId: 1, deletedAt: 1 });

export type HouseDoc = InferSchemaType<typeof houseSchema> & {
  _id: Schema.Types.ObjectId;
};
export const House: Model<HouseDoc> = model<HouseDoc>("House", houseSchema);
