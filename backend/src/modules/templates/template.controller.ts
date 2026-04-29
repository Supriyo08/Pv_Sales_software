import type { RequestHandler } from "express";
import { z } from "zod";
import * as templateService from "./template.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  body: z.string().min(1),
  active: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const renderSchema = z.object({
  values: z.record(z.string(), z.string()).default({}),
  omitSections: z.array(z.string()).default([]),
});

export const list: RequestHandler = async (_req, res, next) => {
  try {
    const all = await templateService.list();
    res.json(
      all.map((t) => ({
        ...t.toObject(),
        analysis: templateService.analyze(t.body),
      }))
    );
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const t = await templateService.getById(req.params.id!);
    res.json({ ...t.toObject(), analysis: templateService.analyze(t.body) });
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const t = await templateService.create({ ...body, createdBy: req.user.sub });
    void audit.log({
      actorId: req.user.sub,
      action: "template.create",
      targetType: "ContractTemplate",
      targetId: t._id.toString(),
      after: t.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json({ ...t.toObject(), analysis: templateService.analyze(t.body) });
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = updateSchema.parse(req.body);
    const before = (await templateService.getById(req.params.id!)).toObject();
    const t = await templateService.update(req.params.id!, body);
    void audit.log({
      actorId: req.user.sub,
      action: "template.update",
      targetType: "ContractTemplate",
      targetId: t._id.toString(),
      before,
      after: t.toObject(),
      requestId: req.requestId,
    });
    res.json({ ...t.toObject(), analysis: templateService.analyze(t.body) });
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const before = (await templateService.getById(id)).toObject();
    await templateService.softDelete(id);
    void audit.log({
      actorId: req.user.sub,
      action: "template.delete",
      targetType: "ContractTemplate",
      targetId: id,
      before,
      requestId: req.requestId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const render: RequestHandler = async (req, res, next) => {
  try {
    const body = renderSchema.parse(req.body ?? {});
    const t = await templateService.getById(req.params.id!);
    const analysis = templateService.analyze(t.body);
    const text = templateService.render(t.body, body.values, body.omitSections);
    res.json({
      text,
      analysis,
      missingPlaceholders: analysis.placeholders
        .map((p) => p.tag)
        .filter((tag) => !body.values[tag]),
    });
  } catch (err) {
    next(err);
  }
};
