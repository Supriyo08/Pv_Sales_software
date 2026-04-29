import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

mongoose.set("strictQuery", true);

export async function connectMongo(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  logger.info({ uri: redact(env.MONGO_URI) }, "MongoDB connected");
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

function redact(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}
