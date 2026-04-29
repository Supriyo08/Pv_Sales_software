import { Schema, model, type InferSchemaType, type Model } from "mongoose";

export const USER_ROLES = ["ADMIN", "AREA_MANAGER", "AGENT"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    territoryId: { type: Schema.Types.ObjectId, ref: "Territory", default: null, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ deletedAt: 1 });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };
export const User: Model<UserDoc> = model<UserDoc>("User", userSchema);
