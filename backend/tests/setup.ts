import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll } from "vitest";
import { registerCommissionHandlers } from "../src/modules/commissions/commission.handlers";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // Per Review 1.1 §8: tests need the commission event handlers wired so that
  // advance-pay-auth + reversal flows actually trigger commission generation.
  // Safe to register once for the whole test run — handlers are stateless.
  registerCommissionHandlers();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(async () => {
  for (const c of Object.values(mongoose.connection.collections)) {
    await c.deleteMany({});
  }
});
