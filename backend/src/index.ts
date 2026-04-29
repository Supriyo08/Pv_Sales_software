import { createApp } from "./app";
import { connectMongo, disconnectMongo } from "./config/db";
import { connectRedis, redis } from "./config/redis";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { registerCommissionHandlers } from "./modules/commissions/commission.handlers";
import { registerNotificationHandlers } from "./modules/notifications/notification.handlers";
import { startBonusWorker, scheduleMonthlyBonus } from "./modules/bonuses/bonus.worker";
import { shutdownQueues } from "./lib/queue";

async function main() {
  await Promise.all([connectMongo(), connectRedis()]);

  registerCommissionHandlers();
  registerNotificationHandlers();
  startBonusWorker();
  await scheduleMonthlyBonus();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close();
    await Promise.allSettled([shutdownQueues(), disconnectMongo(), redis.quit()]);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
