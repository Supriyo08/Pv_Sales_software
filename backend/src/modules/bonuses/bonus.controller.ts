import type { RequestHandler } from "express";
import { z } from "zod";
import * as bonusService from "./bonus.service";
import * as bonusWorker from "./bonus.worker";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const runSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  async: z.boolean().optional(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const period = typeof req.query.period === "string" ? req.query.period : undefined;
    res.json(await bonusService.listBonuses({ userId, period }));
  } catch (err) {
    next(err);
  }
};

export const run: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = runSchema.parse(req.body ?? {});
    const period = body.period ?? bonusService.previousPeriod();

    void audit.log({
      actorId: req.user.sub,
      action: body.async ? "bonus.enqueue" : "bonus.run",
      targetType: "BonusRun",
      targetId: period,
      metadata: { period, async: body.async ?? false },
      requestId: req.requestId,
    });

    if (body.async) {
      const job = await bonusWorker.enqueueBonusRun(period);
      res.status(202).json({ enqueued: true, jobId: job.id, period });
      return;
    }

    const summary = await bonusService.runForPeriod(period);
    res.json(summary);
  } catch (err) {
    next(err);
  }
};
