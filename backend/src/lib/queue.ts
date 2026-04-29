import IORedis from "ioredis";
import { Queue, Worker, type Processor } from "bullmq";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const queueConn = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const workerConn = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const bonusQueue = new Queue("bonus", { connection: queueConn });
export const recalcQueue = new Queue("commission-recalc", { connection: queueConn });

export function startWorker<T = unknown, R = unknown>(name: string, processor: Processor<T, R>) {
  const worker = new Worker<T, R>(name, processor, {
    connection: workerConn,
    concurrency: 2,
  });
  worker.on("completed", (job) => logger.info({ queue: name, jobId: job.id }, "job completed"));
  worker.on("failed", (job, err) =>
    logger.error({ queue: name, jobId: job?.id, err }, "job failed")
  );
  return worker;
}

export async function shutdownQueues(): Promise<void> {
  await Promise.allSettled([bonusQueue.close(), recalcQueue.close()]);
  await Promise.allSettled([queueConn.quit(), workerConn.quit()]);
}
