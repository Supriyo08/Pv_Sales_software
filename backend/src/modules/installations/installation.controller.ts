import type { RequestHandler } from "express";
import { z } from "zod";
import * as installationService from "./installation.service";
import { INSTALLATION_STATUSES } from "./installation.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const transitionSchema = z.object({
  status: z.enum(INSTALLATION_STATUSES),
  notes: z.string().optional(),
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
    const inst = await installationService.transition(req.params.id!, body.status, body.notes);
    void audit.log({
      actorId: req.user.sub,
      action: "installation.transition",
      targetType: "Installation",
      targetId: inst._id.toString(),
      after: inst.toObject(),
      metadata: { to: body.status },
      requestId: req.requestId,
    });
    res.json(inst);
  } catch (err) {
    next(err);
  }
};
