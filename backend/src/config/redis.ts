import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => logger.error({ err }, "Redis error"));

export async function connectRedis(): Promise<void> {
  await redis.connect();
  logger.info("Redis connected");
}
