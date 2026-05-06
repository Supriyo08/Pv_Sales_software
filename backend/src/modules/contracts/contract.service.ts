import path from "path";
import fs from "fs";
import { Contract, type ContractStatus, type PaymentMethod } from "./contract.model";
import { Customer } from "../customers/customer.model";
import { User } from "../users/user.model";
import { SolutionVersion } from "../catalog/solution-version.model";
import { InstallmentPlan } from "../catalog/installment-plan.model";
import { Lead } from "../leads/lead.model";
import { Installation } from "../installations/installation.model";
import { ContractTemplate } from "../templates/template.model";
import * as templateService from "../templates/template.service";
import * as documentService from "../documents/document.service";
import { HttpError } from "../../middleware/error";
import { events } from "../../lib/events";
import { agentIdMatch, type Scope } from "../../lib/scope";

type CreateInput = {
  customerId: string;
  agentId: string;
  solutionVersionId?: string;
  solutionId?: string;
  contractDate?: Date;
  amountCents: number;
  currency?: string;
  leadId?: string | null;
  paymentMethod?: PaymentMethod;
  advanceCents?: number;
  installmentPlanId?: string | null;
};

export async function list(
  filter: { agentId?: string; status?: ContractStatus },
  scope: Scope
) {
  const q: Record<string, unknown> = { ...agentIdMatch(scope) };
  if (filter.agentId) q.agentId = filter.agentId;
  if (filter.status) q.status = filter.status;
  return Contract.find(q).sort({ createdAt: -1 }).limit(200);
}

export async function getById(id: string, scope?: Scope) {
  const c = await Contract.findById(id);
  if (!c) throw new HttpError(404, "Contract not found");
  if (scope && !scope.isAdmin) {
    const ok =
      scope.agentIds.includes(c.agentId.toString()) ||
      (c.managerId && c.managerId.toString() === scope.selfId);
    if (!ok) throw new HttpError(404, "Contract not found");
  }
  return c;
}

export async function create(input: CreateInput) {
  const customer = await Customer.findOne({ _id: input.customerId, deletedAt: null });
  if (!customer) throw new HttpError(400, "Customer not found");

  const agent = await User.findOne({ _id: input.agentId, deletedAt: null });
  if (!agent) throw new HttpError(400, "Agent not found");
  if (agent.role !== "AGENT") throw new HttpError(400, "Contract owner must be AGENT");

  let version;
  if (input.solutionVersionId) {
    version = await SolutionVersion.findById(input.solutionVersionId);
    if (!version) throw new HttpError(400, "Solution version not found");
  } else if (input.solutionId) {
    const at = input.contractDate ?? new Date();
    version = await SolutionVersion.findOne({
      solutionId: input.solutionId,
      active: true,
      validFrom: { $lte: at },
      $or: [{ validTo: null }, { validTo: { $gt: at } }],
    }).sort({ validFrom: -1 });
    if (!version) {
      throw new HttpError(400, "No active solution version at the given date");
    }
  } else {
    throw new HttpError(400, "Either solutionVersionId or solutionId is required");
  }

  // Per Review 1.0 §3: contract amount must fall within version's price range,
  // OR the agent submits a price-approval request (see PriceApprovalRequest).
  if (
    version.minPriceCents !== null &&
    version.minPriceCents !== undefined &&
    input.amountCents < version.minPriceCents
  ) {
    throw new HttpError(
      400,
      `amountCents below the version's min (${version.minPriceCents}). Use the price-approval flow instead.`
    );
  }
  if (
    version.maxPriceCents !== null &&
    version.maxPriceCents !== undefined &&
    input.amountCents > version.maxPriceCents
  ) {
    throw new HttpError(
      400,
      `amountCents above the version's max (${version.maxPriceCents}). Use the price-approval flow instead.`
    );
  }

  if (input.leadId) {
    const lead = await Lead.findOne({ _id: input.leadId, deletedAt: null });
    if (!lead) throw new HttpError(400, "Lead not found");
  }

  // Payment method validation + derived fields
  const paymentMethod: PaymentMethod = input.paymentMethod ?? "ONE_TIME";
  let installmentMonths: number | null = null;
  let installmentAmountCents: number | null = null;
  let advanceCents = 0;

  if (paymentMethod === "ONE_TIME") {
    if (input.installmentPlanId) {
      throw new HttpError(400, "ONE_TIME payment cannot have an installment plan");
    }
    if (input.advanceCents && input.advanceCents > 0) {
      throw new HttpError(400, "ONE_TIME payment cannot have an advance");
    }
  } else {
    if (!input.installmentPlanId) {
      throw new HttpError(400, `${paymentMethod} requires an installmentPlanId`);
    }
    const plan = await InstallmentPlan.findOne({
      _id: input.installmentPlanId,
      deletedAt: null,
      active: true,
    });
    if (!plan) throw new HttpError(400, "Installment plan not found or inactive");
    installmentMonths = plan.months;

    if (paymentMethod === "ADVANCE_INSTALLMENTS") {
      if (!input.advanceCents || input.advanceCents <= 0) {
        throw new HttpError(400, "ADVANCE_INSTALLMENTS requires advanceCents > 0");
      }
      if (input.advanceCents >= input.amountCents) {
        throw new HttpError(400, "advanceCents must be less than the contract amount");
      }
      // Per Review 1.1 §4: advance must fall within the plan's configured range (if set).
      if (
        plan.advanceMinCents !== null &&
        plan.advanceMinCents !== undefined &&
        input.advanceCents < plan.advanceMinCents
      ) {
        throw new HttpError(
          400,
          `advanceCents below the plan's min (${plan.advanceMinCents})`
        );
      }
      if (
        plan.advanceMaxCents !== null &&
        plan.advanceMaxCents !== undefined &&
        input.advanceCents > plan.advanceMaxCents
      ) {
        throw new HttpError(
          400,
          `advanceCents above the plan's max (${plan.advanceMaxCents})`
        );
      }
      advanceCents = input.advanceCents;
      installmentAmountCents = Math.round(
        (input.amountCents - input.advanceCents) / plan.months
      );
    } else {
      // FULL_INSTALLMENTS
      if (input.advanceCents && input.advanceCents > 0) {
        throw new HttpError(
          400,
          "FULL_INSTALLMENTS cannot have an advance — use ADVANCE_INSTALLMENTS"
        );
      }
      installmentAmountCents = Math.round(input.amountCents / plan.months);
    }
  }

  return Contract.create({
    customerId: input.customerId,
    agentId: input.agentId,
    managerId: agent.managerId ?? null,
    territoryId: agent.territoryId ?? null,
    solutionVersionId: version._id,
    amountCents: input.amountCents,
    currency: input.currency ?? version.currency,
    leadId: input.leadId ?? null,
    status: "DRAFT",
    paymentMethod,
    advanceCents,
    installmentPlanId: input.installmentPlanId ?? null,
    installmentMonths,
    installmentAmountCents,
  });
}

/**
 * Per Review 1.1 §1 + Review 1.2 (2026-05-04 expansion): applied by admin/AM
 * after approving a ContractEditRequest. Whitelist now covers every field
 * Review 1.2 calls out — pricing, payment method, installment plan, currency,
 * solution version, agent reassignment, customer reassignment, lead link.
 * Re-runs all create-time validations before persisting and emits
 * `contract.updated` so commission handlers can recalculate.
 *
 * Cancelled contracts cannot be edited.
 */
export type EditableContractFields = {
  amountCents?: number;
  currency?: string;
  paymentMethod?: PaymentMethod;
  advanceCents?: number;
  installmentPlanId?: string | null;
  solutionVersionId?: string;
  agentId?: string;
  customerId?: string;
  leadId?: string | null;
};

export async function applyEdit(id: string, changes: EditableContractFields) {
  const contract = await getById(id);
  if (contract.status === "CANCELLED") {
    throw new HttpError(400, "Cannot edit a cancelled contract");
  }

  // Re-validate referenced agent if reassigning. Per Review 1.2: admin can move
  // a contract between agents through the edit-request flow; the new agent's
  // managerId becomes the contract's manager (matches create() behavior).
  if (changes.agentId !== undefined) {
    const agent = await User.findOne({ _id: changes.agentId, deletedAt: null });
    if (!agent) throw new HttpError(400, "New agent not found");
    if (agent.role !== "AGENT") {
      throw new HttpError(400, "New owner must be an active AGENT");
    }
    contract.agentId = agent._id as unknown as typeof contract.agentId;
    contract.managerId = (agent.managerId ??
      null) as unknown as typeof contract.managerId;
    contract.territoryId = (agent.territoryId ??
      null) as unknown as typeof contract.territoryId;
  }

  // Re-validate referenced customer if reassigning.
  if (changes.customerId !== undefined) {
    const customer = await Customer.findOne({
      _id: changes.customerId,
      deletedAt: null,
    });
    if (!customer) throw new HttpError(400, "New customer not found");
    contract.customerId = customer._id as unknown as typeof contract.customerId;
  }

  // Lead link (null clears).
  if (changes.leadId !== undefined) {
    if (changes.leadId) {
      const lead = await Lead.findOne({ _id: changes.leadId, deletedAt: null });
      if (!lead) throw new HttpError(400, "New lead not found");
    }
    contract.leadId = (changes.leadId ?? null) as unknown as typeof contract.leadId;
  }

  if (changes.currency !== undefined) {
    if (!/^[A-Z]{3}$/.test(changes.currency)) {
      throw new HttpError(400, "currency must be a 3-letter ISO code (e.g. EUR)");
    }
    contract.currency = changes.currency;
  }

  // Determine effective version (existing or new) for price-range validation
  let version;
  const nextVersionId = changes.solutionVersionId ?? contract.solutionVersionId.toString();
  version = await SolutionVersion.findById(nextVersionId);
  if (!version) throw new HttpError(400, "Solution version not found");

  const nextAmount = changes.amountCents ?? contract.amountCents;
  if (
    version.minPriceCents !== null &&
    version.minPriceCents !== undefined &&
    nextAmount < version.minPriceCents
  ) {
    throw new HttpError(
      400,
      `amountCents below the version's min (${version.minPriceCents}). Use the price-approval flow instead.`
    );
  }
  if (
    version.maxPriceCents !== null &&
    version.maxPriceCents !== undefined &&
    nextAmount > version.maxPriceCents
  ) {
    throw new HttpError(
      400,
      `amountCents above the version's max (${version.maxPriceCents}).`
    );
  }

  const nextPaymentMethod: PaymentMethod = changes.paymentMethod ?? contract.paymentMethod;
  let installmentMonths: number | null = contract.installmentMonths ?? null;
  let installmentAmountCents: number | null = contract.installmentAmountCents ?? null;
  let advanceCents = contract.advanceCents ?? 0;
  const nextPlanId =
    changes.installmentPlanId !== undefined
      ? changes.installmentPlanId
      : contract.installmentPlanId?.toString() ?? null;

  if (nextPaymentMethod === "ONE_TIME") {
    if (nextPlanId) throw new HttpError(400, "ONE_TIME payment cannot have an installment plan");
    advanceCents = 0;
    installmentMonths = null;
    installmentAmountCents = null;
  } else {
    if (!nextPlanId) {
      throw new HttpError(400, `${nextPaymentMethod} requires an installmentPlanId`);
    }
    const plan = await InstallmentPlan.findOne({
      _id: nextPlanId,
      deletedAt: null,
      active: true,
    });
    if (!plan) throw new HttpError(400, "Installment plan not found or inactive");
    installmentMonths = plan.months;

    if (nextPaymentMethod === "ADVANCE_INSTALLMENTS") {
      const nextAdvance =
        changes.advanceCents !== undefined ? changes.advanceCents : contract.advanceCents;
      if (!nextAdvance || nextAdvance <= 0) {
        throw new HttpError(400, "ADVANCE_INSTALLMENTS requires advanceCents > 0");
      }
      if (nextAdvance >= nextAmount) {
        throw new HttpError(400, "advanceCents must be less than the contract amount");
      }
      if (
        plan.advanceMinCents !== null &&
        plan.advanceMinCents !== undefined &&
        nextAdvance < plan.advanceMinCents
      ) {
        throw new HttpError(
          400,
          `advanceCents below the plan's min (${plan.advanceMinCents})`
        );
      }
      if (
        plan.advanceMaxCents !== null &&
        plan.advanceMaxCents !== undefined &&
        nextAdvance > plan.advanceMaxCents
      ) {
        throw new HttpError(
          400,
          `advanceCents above the plan's max (${plan.advanceMaxCents})`
        );
      }
      advanceCents = nextAdvance;
      installmentAmountCents = Math.round((nextAmount - nextAdvance) / plan.months);
    } else {
      // FULL_INSTALLMENTS
      advanceCents = 0;
      installmentAmountCents = Math.round(nextAmount / plan.months);
    }
  }

  contract.amountCents = nextAmount;
  contract.paymentMethod = nextPaymentMethod;
  contract.advanceCents = advanceCents;
  contract.installmentPlanId = (nextPlanId ?? null) as unknown as typeof contract.installmentPlanId;
  contract.installmentMonths = installmentMonths;
  contract.installmentAmountCents = installmentAmountCents;
  contract.solutionVersionId = version._id as unknown as typeof contract.solutionVersionId;

  await contract.save();
  events.emit("contract.updated", { contractId: contract._id.toString() });
  return contract;
}

export async function sign(id: string) {
  const contract = await getById(id);
  if (contract.status !== "DRAFT") {
    throw new HttpError(400, `Cannot sign contract in status ${contract.status}`);
  }

  // Per Review 1.1 §1: if a generated draft exists, admin/AM must approve it
  // before the agent can sign/print the contract.
  if (contract.generatedDocumentId && !contract.generationApprovedAt) {
    throw new HttpError(
      403,
      "Generated contract is awaiting admin approval — cannot sign yet"
    );
  }

  contract.status = "SIGNED";
  contract.signedAt = new Date();
  await contract.save();

  if (contract.leadId) {
    await Lead.updateOne({ _id: contract.leadId }, { status: "WON" });
  }

  await Installation.create({
    contractId: contract._id,
    status: "SCHEDULED",
    milestones: [{ status: "SCHEDULED", date: new Date(), notes: "Auto-created on contract sign" }],
  });

  // Per Review 1.0 §5: when approval is required, commissions DO NOT fire on sign;
  // they fire on approve() once admin/AM verifies signatures + data.
  if (!contract.approvalRequired) {
    events.emit("contract.signed", { contractId: contract._id.toString() });
  }
  return contract;
}

export async function attachSignedScan(id: string, documentId: string) {
  const contract = await getById(id);
  if (contract.status !== "SIGNED") {
    throw new HttpError(400, "Signed scan can only be attached to a SIGNED contract");
  }
  contract.signedScanDocumentId = documentId as unknown as typeof contract.signedScanDocumentId;
  await contract.save();
  return contract;
}

export async function approve(id: string, approverId: string) {
  const contract = await getById(id);
  if (contract.status !== "SIGNED") {
    throw new HttpError(400, `Cannot approve contract in status ${contract.status}`);
  }
  if (contract.approvedAt) {
    throw new HttpError(400, "Contract already approved");
  }
  if (contract.approvalRequired && !contract.signedScanDocumentId) {
    throw new HttpError(
      400,
      "A signed scan must be uploaded before this contract can be approved"
    );
  }

  contract.approvedAt = new Date();
  contract.approvedBy = approverId as unknown as typeof contract.approvedBy;
  await contract.save();

  // Per Review 1.1 §8: split the v1.1 single-event flow into two stages so the
  // advance-pay-authorization handler can gate commission generation on AM
  // authorization. Commissions fire when:
  //   - AM authorizes early payment (advance_pay_auth.decided AUTHORIZED), OR
  //   - installation is activated (resolves any pending/declined auth).
  events.emit("contract.approved", { contractId: contract._id.toString() });
  return contract;
}

/**
 * Per Review 1.1 §1: agent generates contract PDF on the contract page.
 * The PDF is persisted as a Document (kind=CONTRACT_DRAFT) and the contract is
 * flagged as awaiting generation approval. Admin/AM must then call
 * `approveGenerated()` before the agent can sign/print.
 *
 * Re-running this on a contract whose previous generation was already approved
 * will reset the approval state — so admin must re-approve any new draft.
 */
export type GenerateInput = {
  templateId: string;
  values: Record<string, string>;
  omitSections?: string[];
  generatedBy: string;
};

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

export async function generate(id: string, input: GenerateInput) {
  const contract = await getById(id);
  if (contract.status !== "DRAFT") {
    throw new HttpError(
      400,
      `Cannot generate a contract PDF for a ${contract.status.toLowerCase()} contract`
    );
  }

  const template = await ContractTemplate.findOne({
    _id: input.templateId,
    deletedAt: null,
    active: true,
  });
  if (!template) throw new HttpError(400, "Template not found or inactive");

  const dir = path.join(UPLOAD_ROOT, "Contract");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Per follow-up to Review 1.1 (2026-05-02) + Review 1.3 (2026-05-04):
  // .docx-uploaded templates round-trip the original Word file. TipTap /
  // .html-uploaded templates fall through to the PDF pipeline.
  //
  // Critical: capture whether the template was originally Word BEFORE
  // `readSourceDocx` self-heals a missing `sourceDocxPath`. If yes-but-now-
  // missing, refuse to silently produce a PDF — that's exactly how a "Word
  // contract turned into an HTML/text-styled PDF for no reason" happens.
  const wasDocxTemplate = !!template.sourceDocxPath;
  const sourceDocx = await templateService.readSourceDocx(template);
  let bytes: Buffer | Uint8Array;
  let mimeType: string;
  let extension: string;

  if (sourceDocx) {
    bytes = templateService.renderDocx(sourceDocx, input.values ?? {});
    mimeType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    extension = "docx";
  } else if (wasDocxTemplate) {
    // The template was uploaded as Word but the source file is gone from
    // disk. Don't silently degrade to a PDF rendered from the HTML mammoth
    // body — that produces a visually-different "html-looking" output that
    // confuses agents and customers. Force the admin to re-upload.
    throw new HttpError(
      409,
      "This template's source .docx is missing on disk (likely lost after a backend restart or deploy). Re-upload the .docx via the templates admin page before generating again."
    );
  } else {
    const text = templateService.render(
      template.body,
      input.values ?? {},
      input.omitSections ?? []
    );
    bytes = await templateService.renderToPdf(
      text,
      `Contract ${contract._id.toString().slice(-8)}`
    );
    mimeType = "application/pdf";
    extension = "pdf";
  }

  const filename = `${Date.now()}-generated-${contract._id.toString()}.${extension}`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, bytes);
  const url = `/uploads/Contract/${filename}`;

  const doc = await documentService.create({
    ownerType: "Contract",
    ownerId: contract._id.toString(),
    kind: "CONTRACT_DRAFT",
    url,
    mimeType,
    sizeBytes: bytes.byteLength,
    uploadedBy: input.generatedBy,
  });

  contract.generatedDocumentId = doc._id as unknown as typeof contract.generatedDocumentId;
  contract.generatedFromTemplateId =
    template._id as unknown as typeof contract.generatedFromTemplateId;
  contract.generationApprovedAt = null;
  contract.generationApprovedBy = null;
  await contract.save();

  events.emit("contract.generation_requested", {
    contractId: contract._id.toString(),
  });

  return { contract, document: doc };
}

export async function approveGenerated(id: string, approverId: string) {
  const contract = await getById(id);
  if (!contract.generatedDocumentId) {
    throw new HttpError(400, "No generated contract to approve");
  }
  if (contract.generationApprovedAt) {
    throw new HttpError(400, "Generated contract already approved");
  }
  contract.generationApprovedAt = new Date();
  contract.generationApprovedBy =
    approverId as unknown as typeof contract.generationApprovedBy;
  await contract.save();

  events.emit("contract.generation_approved", {
    contractId: contract._id.toString(),
    agentId: contract.agentId.toString(),
  });
  return contract;
}

export async function cancel(id: string, reason: string) {
  const contract = await getById(id);
  if (contract.status === "CANCELLED") return contract;
  contract.status = "CANCELLED";
  contract.cancelledAt = new Date();
  contract.cancellationReason = reason;
  await contract.save();
  events.emit("contract.cancelled", { contractId: contract._id.toString() });
  return contract;
}

/**
 * Per Review 1.2 (2026-05-04): a chronological history of every meaningful
 * event in a contract's lifecycle so admins, AMs and agents can scroll through
 * the full story on one page — created → generated → approved → signed →
 * scan uploaded → admin approved → AM advance authorised → installation
 * milestones → commissions paid → reversal reviews → cancellations.
 *
 * Sources merged:
 *   - the Contract document's own dated fields (createdAt, signedAt, …)
 *   - Installation milestones (one row per milestone)
 *   - Commission rows (active + superseded — supersession is its own event)
 *   - ContractEditRequest rows (created + decided)
 *   - AdvancePayAuthorization rows (created + decided)
 *   - ReversalReview rows (created + decided)
 *
 * Returns events sorted ascending by date so the frontend renders a true
 * top-to-bottom timeline.
 */
export type ContractHistoryEvent = {
  at: string;
  kind: string;
  title: string;
  detail?: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function history(id: string): Promise<ContractHistoryEvent[]> {
  const contract = await getById(id);

  const { Commission } = await import("../commissions/commission.model");
  const { ContractEditRequest } = await import(
    "../contract-edit-requests/contract-edit-request.model"
  );
  const { AdvancePayAuthorization } = await import(
    "../advance-pay-authorizations/advance-pay-auth.model"
  );
  const { ReversalReview } = await import(
    "../reversal-reviews/reversal-review.model"
  );

  const events_: ContractHistoryEvent[] = [];

  // ── Contract intrinsic timestamps ────────────────────────────────────────
  events_.push({
    at: (contract.createdAt as Date).toISOString(),
    kind: "contract.created",
    title: "Contract created",
    detail: `${(contract.amountCents / 100).toFixed(2)} ${contract.currency} · ${contract.paymentMethod}`,
    metadata: {
      amountCents: contract.amountCents,
      currency: contract.currency,
      paymentMethod: contract.paymentMethod,
    },
  });

  if (contract.generatedDocumentId && contract.updatedAt) {
    // We don't have a per-event date for generation, so use updatedAt as a
    // best-available approximation for when the latest generation occurred.
    events_.push({
      at: (contract.updatedAt as Date).toISOString(),
      kind: "contract.generated",
      title: "Contract PDF generated",
      detail: contract.generationApprovedAt
        ? "Approved by admin/AM"
        : "Awaiting admin/AM approval",
      metadata: { documentId: contract.generatedDocumentId.toString() },
    });
  }

  if (contract.generationApprovedAt) {
    events_.push({
      at: (contract.generationApprovedAt as Date).toISOString(),
      kind: "contract.generation_approved",
      title: "Generated PDF approved",
      detail: "Agent unlocked to sign + upload signed scan",
      actorId: contract.generationApprovedBy?.toString() ?? null,
    });
  }

  if (contract.signedAt) {
    events_.push({
      at: (contract.signedAt as Date).toISOString(),
      kind: "contract.signed",
      title: "Signed by agent",
      detail: contract.approvalRequired
        ? "Awaiting customer-signed scan + admin approval"
        : "Auto-approved (legacy path)",
    });
  }

  if (contract.signedScanDocumentId) {
    events_.push({
      at: (contract.updatedAt as Date).toISOString(),
      kind: "contract.signed_scan_uploaded",
      title: "Customer-signed scan uploaded",
      metadata: { documentId: contract.signedScanDocumentId.toString() },
    });
  }

  if (contract.approvedAt) {
    events_.push({
      at: (contract.approvedAt as Date).toISOString(),
      kind: "contract.approved",
      title: "Contract approved by admin/AM",
      detail: "Triggered the advance-pay authorization request",
      actorId: contract.approvedBy?.toString() ?? null,
    });
  }

  if (contract.cancelledAt) {
    events_.push({
      at: (contract.cancelledAt as Date).toISOString(),
      kind: "contract.cancelled",
      title: "Contract cancelled",
      detail: contract.cancellationReason || undefined,
    });
  }

  // ── Installation lifecycle ───────────────────────────────────────────────
  const installation = await Installation.findOne({ contractId: contract._id });
  if (installation) {
    for (const m of installation.milestones ?? []) {
      events_.push({
        at: (m.date as Date).toISOString(),
        kind: `installation.${m.status.toLowerCase()}`,
        title: `Installation: ${m.status}`,
        detail: m.notes || undefined,
      });
    }
    if (installation.cancelledAt) {
      events_.push({
        at: (installation.cancelledAt as Date).toISOString(),
        kind: "installation.cancelled",
        title: "Installation cancelled",
        detail: installation.cancellationReason || undefined,
      });
    }
  }

  // ── Commission ledger (active + superseded) ──────────────────────────────
  const commissions = await Commission.find({ contractId: contract._id }).lean();
  for (const c of commissions) {
    events_.push({
      at: (c.generatedAt as Date).toISOString(),
      kind: "commission.generated",
      title: `Commission paid (${c.beneficiaryRole})`,
      detail: `${(c.amountCents / 100).toFixed(2)} ${c.currency} via ${c.sourceEvent}`,
      actorId: c.beneficiaryUserId.toString(),
      metadata: {
        amountCents: c.amountCents,
        bonus: false,
        superseded: !!c.supersededAt,
      },
    });
    if (c.supersededAt) {
      events_.push({
        at: (c.supersededAt as Date).toISOString(),
        kind: "commission.superseded",
        title: `Commission reversed (${c.beneficiaryRole})`,
        detail: `${(c.amountCents / 100).toFixed(2)} ${c.currency} · ${c.reason ?? "no reason"}`,
        actorId: c.beneficiaryUserId.toString(),
      });
    }
  }

  // ── Contract edit requests ───────────────────────────────────────────────
  const editRequests = await ContractEditRequest.find({
    contractId: contract._id,
  }).lean();
  for (const er of editRequests) {
    events_.push({
      at: (er.createdAt as Date).toISOString(),
      kind: "contract.edit_requested",
      title: "Edit requested",
      detail:
        er.reason ||
        `Fields: ${Object.keys((er.changes as Record<string, unknown>) ?? {}).join(", ")}`,
      actorId: er.requestedBy.toString(),
      metadata: { status: er.status, changes: er.changes },
    });
    if (er.decidedAt) {
      events_.push({
        at: (er.decidedAt as Date).toISOString(),
        kind: `contract.edit_${er.status.toLowerCase()}`,
        title: `Edit ${er.status.toLowerCase()}`,
        detail: er.decisionNote || undefined,
        actorId: er.decidedBy?.toString() ?? null,
      });
    }
  }

  // ── Advance pay authorizations ───────────────────────────────────────────
  // Per Review 1.2 (2026-05-04): two-stage decision flow — surface BOTH the
  // manager and admin decisions in the contract history so everyone sees who
  // greenlit early payment (or where it stalled).
  const auths = await AdvancePayAuthorization.find({
    contractId: contract._id,
  }).lean();
  for (const a of auths) {
    events_.push({
      at: (a.requestedAt as Date | undefined ?? a.createdAt as Date).toISOString(),
      kind: "advance_pay_auth.requested",
      title: "Advance commission authorization requested",
      detail: "Sent to area manager for stage-1 review",
    });
    if (a.managerDecidedAt) {
      events_.push({
        at: (a.managerDecidedAt as Date).toISOString(),
        kind: `advance_pay_auth.manager.${(a.managerDecision ?? "").toLowerCase()}`,
        title:
          a.managerDecision === "APPROVED"
            ? "Advance commission — manager APPROVED (awaiting admin)"
            : "Advance commission — manager DECLINED (deferred to install)",
        detail: a.managerNote || undefined,
        actorId: a.managerDecidedBy?.toString() ?? null,
      });
    }
    if (a.adminDecidedAt) {
      events_.push({
        at: (a.adminDecidedAt as Date).toISOString(),
        kind: `advance_pay_auth.admin.${(a.adminDecision ?? "").toLowerCase()}`,
        title:
          a.adminDecision === "APPROVED"
            ? "Advance commission — admin APPROVED (early payment fired)"
            : "Advance commission — admin DECLINED (deferred to install)",
        detail: a.adminNote || undefined,
        actorId: a.adminDecidedBy?.toString() ?? null,
      });
    }
    // Legacy single-stage rows (PENDING / AUTHORIZED / DECLINED) — render the
    // resolved status if it didn't go through the two-stage fields above.
    if (
      !a.managerDecidedAt &&
      !a.adminDecidedAt &&
      a.decidedAt &&
      (a.status === "AUTHORIZED" ||
        a.status === "DECLINED" ||
        a.status === "RESOLVED_BY_INSTALL")
    ) {
      events_.push({
        at: (a.decidedAt as Date).toISOString(),
        kind: `advance_pay_auth.${a.status.toLowerCase()}`,
        title:
          a.status === "AUTHORIZED"
            ? "Advance commission AUTHORIZED"
            : a.status === "DECLINED"
              ? "Advance commission DECLINED"
              : "Advance auth resolved by install",
        detail: a.note || undefined,
        actorId: a.decidedBy?.toString() ?? null,
      });
    }
  }

  // ── Reversal reviews (admin decisions on cancelled installs) ─────────────
  const reviews = await ReversalReview.find({ contractId: contract._id }).lean();
  for (const r of reviews) {
    events_.push({
      at: (r.createdAt as Date).toISOString(),
      kind: "reversal_review.created",
      title: `Reversal review (${r.kind})`,
      detail: `${(r.amountCents / 100).toFixed(2)} ${r.currency} affected`,
    });
    if (r.decidedAt) {
      events_.push({
        at: (r.decidedAt as Date).toISOString(),
        kind: `reversal_review.${(r.decision ?? "decided").toLowerCase()}`,
        title: `Reversal ${r.decision ?? "decided"}`,
        detail: r.decisionNote || undefined,
        actorId: r.decidedBy?.toString() ?? null,
      });
    }
  }

  // Sort ascending so the timeline reads top-to-bottom chronologically.
  events_.sort((a, b) => a.at.localeCompare(b.at));
  return events_;
}
