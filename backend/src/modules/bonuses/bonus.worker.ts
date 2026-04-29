import { bonusQueue, startWorker } from "../../lib/queue";
import * as bonusService from "./bonus.service";
import { logger } from "../../utils/logger";

export const BONUS_JOB_NAME = "monthly-bonus-run";

export function startBonusWorker() {
  startWorker<{ period: string }>(bonusQueue.name, async (job) => {
    return bonusService.runForPeriod(job.data.period);
  });
}

export async function scheduleMonthlyBonus() {
  await bonusQueue.upsertJobScheduler(
    "monthly-bonus-scheduler",
    { pattern: "0 0 1 * *" },
    {
      name: BONUS_JOB_NAME,
      data: {},
      opts: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    }
  );
  logger.info("Monthly bonus scheduler armed (1st of month at 00:00 UTC)");
}

export async function enqueueBonusRun(period: string) {
  return bonusQueue.add(BONUS_JOB_NAME, { period });
}
