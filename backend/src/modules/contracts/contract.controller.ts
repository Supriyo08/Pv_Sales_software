import type { RequestHandler } from "express";
import path from "path";
import { z } from "zod";
import { Types } from "mongoose";
import * as contractService from "./contract.service";
import { Contract, CONTRACT_STATUSES, PAYMENT_METHODS } from "./contract.model";
import { PvDocument } from "../documents/document.model";
import {
  docxFileToPdfWithCache,
  LibreOfficeUnavailableError,
} from "../../lib/docxToPdf";
import * as audit from "../audit/audit.service";
import { HttpError } from "../../middleware/error";
import { buildScope } from "../../lib/scope";

const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: "Invalid ObjectId" });

const createSchema = z.object({
  customerId: objectId,
  agentId: objectId,
  solutionVersionId: objectId.optional(),
  solutionId: objectId.optional(),
  contractDate: z.coerce.date().optional(),
  amountCents: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  leadId: objectId.nullish(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  advanceCents: z.number().int().min(0).optional(),
  installmentPlanId: objectId.nullish(),
}).refine((v) => v.solutionVersionId || v.solutionId, {
  message: "Either solutionVersionId or solutionId must be provided",
  path: ["solutionVersionId"],
});

// Per Review 1.3 (2026-05-04): cancellation must always include a reason —
// it surfaces in audit log, contract history, and reversal-review notifications.
const cancelSchema = z.object({
  reason: z
    .string()
    .min(3, "A cancellation reason is required (min 3 chars)")
    .max(500),
});

export const list: RequestHandler = async (req, res, next) => {
  try {
    const scope = await buildScope(req.user);
    const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
    const status = typeof req.query.status === "string" ? (req.query.status as never) : undefined;
    res.json(await contractService.list({ agentId, status }, scope));
  } catch (err) {
    next(err);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    const scope = await buildScope(req.user);
    res.json(await contractService.getById(req.params.id!, scope));
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = createSchema.parse(req.body);
    const c = await contractService.create({
      ...body,
      leadId: body.leadId ?? null,
      installmentPlanId: body.installmentPlanId ?? null,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "contract.create",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.status(201).json(c);
  } catch (err) {
    next(err);
  }
};

export const sign: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const before = (await contractService.getById(req.params.id!, await buildScope(req.user))).toObject();
    const c = await contractService.sign(req.params.id!);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.sign",
      targetType: "Contract",
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

const attachScanSchema = z.object({ documentId: objectId });

export const attachSignedScan: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = attachScanSchema.parse(req.body);
    const c = await contractService.attachSignedScan(req.params.id!, body.documentId);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.attach-scan",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      metadata: { documentId: body.documentId },
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const approve: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const c = await contractService.approve(req.params.id!, req.user.sub);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.approve",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

const generateSchema = z.object({
  templateId: objectId,
  values: z.record(z.string()).default({}),
  omitSections: z.array(z.string()).optional(),
});

export const generate: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = generateSchema.parse(req.body);
    const result = await contractService.generate(req.params.id!, {
      templateId: body.templateId,
      values: body.values,
      omitSections: body.omitSections,
      generatedBy: req.user.sub,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "contract.generate",
      targetType: "Contract",
      targetId: result.contract._id.toString(),
      after: result.contract.toObject(),
      metadata: { templateId: body.templateId, documentId: result.document._id.toString() },
      requestId: req.requestId,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const approveGenerated: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const c = await contractService.approveGenerated(req.params.id!, req.user.sub);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.generation.approve",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

/**
 * Per Review 1.5 follow-up (2026-05-07): the agent's "Download PDF" button
 * on a generated Word contract used to capture the docx-preview DOM with
 * html2canvas — losing fonts, tables, headers, footers. We instead convert
 * the original .docx to PDF via headless LibreOffice (`soffice`) so the
 * output is byte-identical to what Word produces. Cached on disk per
 * (path + size + mtime) so repeated downloads don't re-convert.
 *
 * If LibreOffice isn't installed on the host, returns 503 with
 * `code: "LIBREOFFICE_UNAVAILABLE"` — the frontend then falls back to its
 * client-side rasterised PDF.
 */
export const downloadGeneratedPdf: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    const contract = await Contract.findById(req.params.id!);
    if (!contract) throw new HttpError(404, "Contract not found");
    if (!scope.isAdmin) {
      const visible =
        scope.agentIds.includes(contract.agentId.toString()) ||
        (contract.managerId && contract.managerId.toString() === scope.selfId);
      if (!visible) throw new HttpError(404, "Contract not found");
    }
    if (!contract.generatedDocumentId) {
      throw new HttpError(
        400,
        "No generated contract document to convert — generate the contract first."
      );
    }
    const doc = await PvDocument.findById(contract.generatedDocumentId);
    if (!doc) throw new HttpError(404, "Generated document not found");

    const isDocx =
      (doc.mimeType ?? "").includes("wordprocessingml") ||
      doc.url.toLowerCase().endsWith(".docx");
    if (!isDocx) {
      // Already a PDF — just redirect to the static URL.
      res.redirect(doc.url);
      return;
    }

    const absPath = path.resolve(
      process.cwd(),
      doc.url.replace(/^\/uploads\//, "uploads/")
    );

    try {
      const pdfBuffer = await docxFileToPdfWithCache(absPath);
      const filename = `contract-${contract._id.toString().slice(-8)}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      if (err instanceof LibreOfficeUnavailableError) {
        res.status(503).json({
          error: err.message,
          code: "LIBREOFFICE_UNAVAILABLE",
        });
        return;
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

// ─── Per Review 1.5 (2026-05-07): post-sign lifecycle endpoints ──────────

const checkSchema = z.object({
  outcome: z.enum(["OK", "INTEGRATION_NEEDED", "NOT_DOABLE"]),
  notes: z.string().max(2000).optional(),
});

const integrationSchema = z.object({
  amountCents: z.number().int().min(0),
  documentId: objectId.nullish(),
  notes: z.string().max(2000).optional(),
});

const integrationDecisionSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  signedDocumentId: objectId.optional(),
});

const cambialeSchema = z.object({ documentId: objectId });

const planInstallationSchema = z.object({
  plannedFor: z.coerce.date(),
});

export const markPrinted: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const c = await contractService.markPrinted(req.params.id!);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.printed",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const decideTechnicalSurvey: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = checkSchema.parse(req.body);
    const c = await contractService.decideCheck(
      req.params.id!,
      "technical",
      body.outcome,
      req.user.sub,
      body.notes ?? ""
    );
    void audit.log({
      actorId: req.user.sub,
      action: `contract.technical_survey.${body.outcome.toLowerCase()}`,
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const decideAdministrativeCheck: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = checkSchema.parse(req.body);
    const c = await contractService.decideCheck(
      req.params.id!,
      "administrative",
      body.outcome,
      req.user.sub,
      body.notes ?? ""
    );
    void audit.log({
      actorId: req.user.sub,
      action: `contract.administrative_check.${body.outcome.toLowerCase()}`,
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const setIntegration: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = integrationSchema.parse(req.body);
    const c = await contractService.setIntegration(req.params.id!, {
      amountCents: body.amountCents,
      documentId: body.documentId ?? null,
      notes: body.notes,
    });
    void audit.log({
      actorId: req.user.sub,
      action: "contract.integration.set",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const decideIntegration: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = integrationDecisionSchema.parse(req.body);
    const c = await contractService.decideIntegration(
      req.params.id!,
      body.decision,
      body.signedDocumentId ?? null
    );
    void audit.log({
      actorId: req.user.sub,
      action: `contract.integration.${body.decision.toLowerCase()}`,
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const attachCambiale: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = cambialeSchema.parse(req.body);
    const c = await contractService.attachCambiale(req.params.id!, body.documentId);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.cambiale.attach",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const planInstallation: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = planInstallationSchema.parse(req.body);
    const c = await contractService.planInstallation(req.params.id!, body.plannedFor);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.installation.plan",
      targetType: "Contract",
      targetId: c._id.toString(),
      after: c.toObject(),
      requestId: req.requestId,
    });
    res.json(c);
  } catch (err) {
    next(err);
  }
};

export const cancel: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const body = cancelSchema.parse(req.body);
    const before = (await contractService.getById(req.params.id!, await buildScope(req.user))).toObject();
    const c = await contractService.cancel(req.params.id!, body.reason);
    void audit.log({
      actorId: req.user.sub,
      action: "contract.cancel",
      targetType: "Contract",
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

// Per Review 1.2 (2026-05-04): chronological history of every event in the
// contract's lifecycle. Honours the same scope rules as `get` so agents only
// see history for their own contracts.
export const history: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const scope = await buildScope(req.user);
    await contractService.getById(req.params.id!, scope);
    const events = await contractService.history(req.params.id!);
    res.json(events);
  } catch (err) {
    next(err);
  }
};

export { CONTRACT_STATUSES };
