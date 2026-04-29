import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const INSTALLATION_STATUSES = [
  "SCHEDULED",
  "SURVEY",
  "PERMITS",
  "INSTALLED",
  "ACTIVATED",
  "INSPECTED",
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
