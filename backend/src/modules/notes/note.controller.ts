import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as service from "./note.service";
import { NOTE_TARGETS, type NoteTarget } from "./note.model";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  targetType: z.enum(NOTE_TARGETS),
  targetId: objectId,
  body: z.string().min(1).max(4000),
});

const querySchema = z.object({
  targetType: z.enum(NOTE_TARGETS),
  targetId: objectId,
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const q = querySchema.parse({
      targetType: req.query.targetType,
      targetId: req.query.targetId,
    });
    res.json(await service.list(q.targetType as NoteTarget, q.targetId, scope));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = createSchema.parse(req.body);
    const note = await service.create(
      body.targetType as NoteTarget,
      body.targetId,
      req.user.sub,
      body.body,
      scope
    );
    void audit.log({
      actorId: req.user.sub,
      action: "note.create",
      targetType: body.targetType,
      targetId: body.targetId,
      metadata: { noteId: note._id.toString() },
      requestId: req.requestId,
    });
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
};
