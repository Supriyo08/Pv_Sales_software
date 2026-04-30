import { Contract, type ContractStatus, type PaymentMethod } from "./contract.model";
import { Customer } from "../customers/customer.model";
import { User } from "../users/user.model";
import { SolutionVersion } from "../catalog/solution-version.model";
import { InstallmentPlan } from "../catalog/installment-plan.model";
import { Lead } from "../leads/lead.model";
import { Installation } from "../installations/installation.model";
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

export async function sign(id: string) {
  const contract = await getById(id);
  if (contract.status !== "DRAFT") {
    throw new HttpError(400, `Cannot sign contract in status ${contract.status}`);
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

  events.emit("contract.signed", { contractId: contract._id.toString() });
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
