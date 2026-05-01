import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const INSTALLATION_STATUSES = [
  "SCHEDULED",
  "SURVEY",
  "PERMITS",
  "INSTALLED",
  "ACTIVATED",
  "INSPECTED",
  // Per Review 1.1 §7: cancellation invalidates any commission/bonus that depended
  // on this installation. Triggers a reversal review (admin chooses what to do).
  "CANCELLED",
] as const;
export type InstallationStatus = (typeof INSTALLATION_STATUSES)[number];

const milestoneSchema = new Schema(
  {
    status: { type: String, enum: INSTALLATION_STATUSES, required: true },
    date: { type: Date, required: true },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const installationSchema = new Schema(
  {
    contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true, unique: true },
    status: { type: String, enum: INSTALLATION_STATUSES, default: "SCHEDULED", index: true },
    milestones: { type: [milestoneSchema], default: [] },
    activatedAt: { type: Date, default: null, index: true },
    // Per Review 1.1 §7: cancellation metadata.
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: "" },
  },
  { timestamps: true }
);

export type InstallationDoc = InferSchemaType<typeof installationSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Installation: Model<InstallationDoc> = model<InstallationDoc>(
  "Installation",
  installationSchema
);
