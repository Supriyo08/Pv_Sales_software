import type { RequestHandler } from "express";
import { z } from "zod";
import * as installationService from "./installation.service";
import { INSTALLATION_STATUSES } from "./installation.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const transitionSchema = z.object({
  status: z.enum(INSTALLATION_STATUSES),
  notes: z.string().optional(),
  occurredAt: z.coerce.date().optional(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? (req.query.status as never) : undefined;
    res.json(await installationService.list({ status }));
  } catch (err) {
    next(err);
  }
};

export const transition: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = transitionSchema.parse(req.body);
    const inst = await installationService.transition(
      req.params.id!,
      body.status,
      body.notes,
      body.occurredAt
    );
    void audit.log({
      actorId: req.user.sub,
      action: "installation.transition",
      targetType: "Installation",
      targetId: inst._id.toString(),
      after: inst.toObject(),
      metadata: { to: body.status, occurredAt: body.occurredAt },
      requestId: req.requestId,
    });
    res.json(inst);
  } catch (err) {
    next(err);
  }
};

const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

// Per Review 1.1 §7: cancel an installation; fires reversal-review for affected commissions.
export const cancel: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = cancelSchema.parse(req.body);
    const { installation, previousStatus } = await installationService.cancel(
      req.params.id!,
      body.reason
    );
    void audit.log({
      actorId: req.user.sub,
      action: "installation.cancel",
      targetType: "Installation",
      targetId: installation._id.toString(),
      after: installation.toObject(),
      metadata: { reason: body.reason, previousStatus },
      requestId: req.requestId,
    });
    res.json(installation);
  } catch (err) {
    next(err);
  }
};
