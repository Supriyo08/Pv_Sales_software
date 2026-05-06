import type { RequestHandler } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as customerService from "./customer.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";
import { isValidItalianFiscalCode } from "../../lib/italianFiscalCode";
import { CustomerNote } from "./customer-note.model";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const addressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  })
  .partial();

// Per Review 1.5 (2026-05-04): the only mandatory fields at create time are
// `fullName` (or its split firstName/surname). Fiscal code is optional but,
// when provided, must be a valid Italian codice fiscale. PEC is optional at
// create — gated mandatory before installation planning (enforced at the
// install step, not here). Phone numbers accept international or IT national
// formats; we keep the regex permissive to avoid false rejections of legacy
// data, just stripping spaces/dashes.
const phoneRegex = /^[+]?[0-9 .\-/]{6,20}$/;

const createSchema = z
  .object({
    fiscalCode: z
      .string()
      .optional()
      .refine((v) => isValidItalianFiscalCode(v), {
        message: "Invalid Italian fiscal code (codice fiscale)",
      }),
    fullName: z.string().min(1).optional(),
    firstName: z.string().min(1).optional(),
    surname: z.string().min(1).optional(),
    birthDate: z.coerce.date().optional().nullable(),
    email: z.string().email().or(z.literal("")).optional(),
    pecEmail: z.string().email().or(z.literal("")).optional(),
    phone: z.string().regex(phoneRegex).or(z.literal("")).optional(),
    cellphone: z.string().regex(phoneRegex).or(z.literal("")).optional(),
    idNumber: z.string().optional(),
    idExpireDate: z.coerce.date().optional().nullable(),
    address: addressSchema.optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    assignedAgentId: objectId.nullish(),
  })
  .refine((v) => v.fullName || (v.firstName && v.surname), {
    message: "Provide fullName, or both firstName and surname (Review 1.5)",
    path: ["fullName"],
  });

const updateSchema = createSchema.innerType().partial();

const commissionSplitSchema = z.object({
  agentSplits: z
    .array(
      z.object({
        userId: objectId,
        bp: z.number().int().min(0).max(10_000),
      })
    )
    .min(1),
  bonusCountBeneficiaryId: objectId.nullish(),
  managerBonusBeneficiaryId: objectId.nullish(),
  managerOverrideBeneficiaryId: objectId.nullish(),
});

const reassignSchema = z.object({
  agentId: objectId.nullable(),
  // Per Review 1.1 §6: optional split — null = clear, omitted = unchanged.
  commissionSplit: commissionSplitSchema.nullable().optional(),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const scope = await buildScope(req.user);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await customerService.list({ search }, scope));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const scope = await buildScope(req.user);
    res.json(await customerService.getById(req.params.id!, scope));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = createSchema.parse(req.body);
    const c = await customerService.create(
      body as Parameters<typeof customerService.create>[0],
      scope
    );
    void audit.log({
      actorId: req.user.sub,
      action: "customer.create",
      targetType: "Customer",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = updateSchema.parse(req.body);
    const before = (await customerService.getById(req.params.id!, scope)).toObject();
    const c = await customerService.update(
      req.params.id!,
      body as Parameters<typeof customerService.update>[1],
      scope
    );
    void audit.log({
      actorId: req.user.sub,
      action: "customer.update",
      targetType: "Customer",
      targetId: c._id.toString(),
      before,
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const id = req.params.id!;
    const before = (await customerService.getById(id, scope)).toObject();
    await customerService.softDelete(id, scope);
    void audit.log({
      actorId: req.user.sub,
      action: "customer.delete",
      targetType: "Customer",
      targetId: id,
      before,
      requestId: req.requestId,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ─── Notes (Review 1.5: chat over customer) ────────────────────────────────

const noteSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const listNotes: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    // Visibility check: caller must be able to see the customer.
    await customerService.getById(req.params.id!, scope);
    const notes = await CustomerNote.find({ customerId: req.params.id! })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json(notes);
  } catch (err) {
    next(err);
  }
};

export const createNote: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    await customerService.getById(req.params.id!, scope);
    const body = noteSchema.parse(req.body);
    const note = await CustomerNote.create({
      customerId: req.params.id!,
      authorId: req.user.sub,
      body: body.body,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "customer.note.create",
      targetType: "Customer",
      targetId: req.params.id!,
      after: note.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
};

export const reassign: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const body = reassignSchema.parse(req.body);
    const id = req.params.id!;
    const before = (await customerService.getById(id, scope)).toObject();
    const updated = await customerService.reassign(
      id,
      body.agentId,
      scope,
      body.commissionSplit === undefined
        ? undefined
        : (body.commissionSplit as Parameters<typeof customerService.reassign>[3])
    );
    void audit.log({
      actorId: req.user.sub,
      action: "customer.reassign",
      targetType: "Customer",
      targetId: id,
      before,
      after: updated.toObject(),
      metadata: {
        newAgentId: body.agentId,
        commissionSplit: body.commissionSplit ?? null,
      },
      requestId: req.requestId,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};
