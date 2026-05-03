import type { RequestHandler, Request } from "express";
import path from "path";
import multer from "multer";
import { z } from "zod";
import { Types } from "mongoose";
import * as templateService from "./template.service";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  body: z.string().min(1),
  active: z.boolean().optional(),
  solutionIds: z.array(objectId).optional(),
});

const updateSchema = createSchema.partial();

const renderSchema = z.object({
  values: z.record(z.string(), z.string()).default({}),
  omitSections: z.array(z.string()).default([]),
});

/**
 * Per follow-up to Review 1.1 (round 2, 2026-05-02): if a template's
 * `sourceDocxPath` points at a file that no longer exists on disk (e.g. the
 * template was created before persistence was wired up, or the file was
 * deleted), strip it from the response so the frontend doesn't try to fetch
 * a missing file. The frontend then renders it as a regular HTML template.
 */
async function projectTemplate(t: Awaited<ReturnType<typeof templateService.getById>>) {
  const obj = t.toObject() as Record<string, unknown> & { sourceDocxPath?: string | null };
  if (obj.sourceDocxPath) {
    const buffer = await templateService.readSourceDocx({
      sourceDocxPath: obj.sourceDocxPath,
    });
    if (!buffer) obj.sourceDocxPath = null;
  }
  return { ...obj, analysis: templateService.analyze(t.body) };
}

export const list: RequestHandler = async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const all = await templateService.list({ includeArchived });
    const projected = await Promise.all(all.map(projectTemplate));
    res.json(projected);
  } catch (err) {
    next(err);
  }
};

// Per Review 1.2 (2026-05-04): chronological version history derived from the
// audit log — every create/update/upload/delete/restore on this template, with
// before/after snapshots so the UI can compute a diff.
export const history: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const entries = await audit.listForTarget(
      "ContractTemplate",
      req.params.id!
    );
    res.json(entries);
  } catch (err) {
    next(err);
  }
};

// Per Review 1.2 (2026-05-04): restore an archived template (clears `deletedAt`
// and re-activates it).
export const restore: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const id = req.params.id!;
    const t = await templateService.restore(id);
    void audit.log({
      actorId: req.user.sub,
      action: "template.restore",
      targetType: "ContractTemplate",
      targetId: id,
      after: t.toObject(),
      requestId: req.requestId,
    });
    res.json(await projectTemplate(t));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const t = await templateService.getById(req.params.id!);
    res.json(await projectTemplate(t));
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

// Per Review 1.1 §2: upload a .html / .docx template from desktop. Files are
// processed in-memory (small enough — .docx caps around 10 MB) and converted
// to HTML; we never write the source file to disk because the body is what
// matters once parsed.
const ACCEPTED_TEMPLATE_TYPES = [
  ".html",
  ".htm",
  ".docx",
  ".txt",
  "text/html",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const uploadStorage = multer.memoryStorage();
export const uploadMiddleware = multer({
  storage: uploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ACCEPTED_TEMPLATE_TYPES.includes(ext) || ACCEPTED_TEMPLATE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, "Only .html, .htm, .docx, .txt are accepted"));
    }
  },
}).single("file");

const uploadFieldsSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // Comes through as a JSON string in multipart; controller parses.
  solutionIds: z.string().optional(),
});

type UploadRequest = Request & { file?: Express.Multer.File };

export const upload: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const file = (req as UploadRequest).file;
    if (!file) throw new HttpError(400, "file is required");

    const fields = uploadFieldsSchema.parse(req.body);
    let solutionIds: string[] | undefined;
    if (fields.solutionIds) {
      try {
        const arr = JSON.parse(fields.solutionIds);
        if (!Array.isArray(arr)) throw new Error();
        solutionIds = arr.filter((v) => typeof v === "string");
      } catch {
        throw new HttpError(400, "solutionIds must be a JSON array of ObjectIds");
      }
    }

    const t = await templateService.createFromUpload({
      filename: file.originalname,
      buffer: file.buffer,
      mimeType: file.mimetype,
      name: fields.name,
      description: fields.description,
      solutionIds,
      createdBy: req.user.sub,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "template.upload",
      targetType: "ContractTemplate",
      targetId: t._id.toString(),
      after: t.toObject(),
      metadata: { filename: file.originalname, mimeType: file.mimetype },
      requestId: req.requestId,
    });
    res.status(201).json({ ...t.toObject(), analysis: templateService.analyze(t.body) });
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

/**
 * Per follow-up to Review 1.1 (round 2, 2026-05-02): for templates uploaded as
 * .docx, the standalone preview page renders the substituted Word document
 * inline (so admins/agents see the same Word-fidelity output that contract
 * generation would produce). This endpoint streams the rendered .docx bytes.
 */
const renderDocxSchema = z.object({
  values: z.record(z.string(), z.string()).default({}),
});

export const renderDocx: RequestHandler = async (req, res, next) => {
  try {
    const body = renderDocxSchema.parse(req.body ?? {});
    const t = await templateService.getById(req.params.id!);
    const sourceBuffer = await templateService.readSourceDocx(t);
    if (!sourceBuffer) {
      throw new HttpError(
        400,
        "This template has no .docx source — use POST /:id/render for the text/HTML preview."
      );
    }
    const out = templateService.renderDocx(sourceBuffer, body.values);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${t.name.replace(/[^a-zA-Z0-9._-]/g, "_")}.docx"`
    );
    res.send(out);
  } catch (err) {
    next(err);
  }
};
