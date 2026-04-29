import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import { USER_ROLES } from "../users/user.model";

export const COMMISSION_SOURCE_EVENTS = [
  "CONTRACT_SIGNED",
  "INSTALLATION_ACTIVATED",
  "BONUS_AGENT_INSTALLATIONS",
  "BONUS_NETWORK_INSTALLATIONS",
] as const;
export type CommissionSourceEvent = (typeof COMMISSION_SOURCE_EVENTS)[number];

const commissionSchema = new Schema(
  {
    contractId: { type: Schema.Types.ObjectId, ref: "Contract", default: null, index: true },
    beneficiaryUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    beneficiaryRole: { type: String, enum: USER_ROLES, required: true, index: true },
    sourceEvent: { type: String, enum: COMMISSION_SOURCE_EVENTS, required: true, index: true },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    period: { type: String, default: null, index: true },
    generatedAt: { type: Date, required: true, default: () => new Date() },
    supersededBy: { type: Schema.Types.ObjectId, ref: "Commission", default: null },
    supersededAt: { type: Date, default: null, index: true },
    reason: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

commissionSchema.index({ beneficiaryUserId: 1, supersededAt: 1, generatedAt: -1 });
commissionSchema.index({ contractId: 1, supersededAt: 1 });
commissionSchema.index({ period: 1, beneficiaryUserId: 1 });

export type CommissionDoc = InferSchemaType<typeof commissionSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Commission: Model<CommissionDoc> = model<CommissionDoc>(
  "Commission",
  commissionSchema
);
