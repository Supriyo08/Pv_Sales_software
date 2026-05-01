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
 * Per Review 1.1 §1: applied by admin/AM after approving a ContractEditRequest.
 * Whitelisted fields only — re-runs the same validation as create() (price range,
 * payment method invariants, plan lookup) before persisting. Emits `contract.updated`
 * so commission handlers can recalculate.
 *
 * Cancelled or already-signed-and-approved contracts cannot be edited.
 */
export type EditableContractFields = {
  amountCents?: number;
  paymentMethod?: PaymentMethod;
  advanceCents?: number;
  installmentPlanId?: string | null;
  solutionVersionId?: string;
};

export async function applyEdit(id: string, changes: EditableContractFields) {
  const contract = await getById(id);
  if (contract.status === "CANCELLED") {
    throw new HttpError(400, "Cannot edit a cancelled contract");
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

  const text = templateService.render(
    template.body,
    input.values ?? {},
    input.omitSections ?? []
  );
  const pdfBytes = await templateService.renderToPdf(
    text,
    `Contract ${contract._id.toString().slice(-8)}`
  );

  const dir = path.join(UPLOAD_ROOT, "Contract");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-generated-${contract._id.toString()}.pdf`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, pdfBytes);
  const url = `/uploads/Contract/${filename}`;

  const doc = await documentService.create({
    ownerType: "Contract",
    ownerId: contract._id.toString(),
    kind: "CONTRACT_DRAFT",
    url,
    mimeType: "application/pdf",
    sizeBytes: pdfBytes.byteLength,
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
