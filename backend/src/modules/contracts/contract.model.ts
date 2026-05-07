import { Schema, model, type InferSchemaType, type Model } from "mongoose";

// Per Review 1.5 (2026-05-07): the contract lifecycle has many more stages
// than v1.0's three. Old codepaths (sign/approve/cancel) keep working because
// DRAFT / SIGNED / CANCELLED remain valid values; the additional stages are
// inserted between them or follow SIGNED.
//
//   DRAFT → READY_TO_GENERATE (4 fulfilment sections complete, agent has not
//                              clicked Generate yet)
//         → GENERATED          (agent generated, awaiting admin approval)
//         → APPROVED           (admin approved generation; agent can print)
//         → WAITING_SIGNING    (agent printed; awaiting signed scan)
//         → SIGNED             (signed scan uploaded, admin re-approves)
//         → TECHNICAL_SURVEY_OK (admin marked tech survey OK)
//         → ADMIN_CHECK_OK     (admin marked bureaucratic check OK)
//         → INSTALLATION_PLANNED (final stage)
//   any → CANCELLED            (terminal; reason mandatory)
export const CONTRACT_STATUSES = [
  "DRAFT",
  "READY_TO_GENERATE",
  "GENERATED",
  "APPROVED",
  "WAITING_SIGNING",
  "SIGNED",
  "TECHNICAL_SURVEY_OK",
  "ADMIN_CHECK_OK",
  "INSTALLATION_PLANNED",
  "CANCELLED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "ONE_TIME",
  "ADVANCE_INSTALLMENTS",
  "FULL_INSTALLMENTS",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Per Review 1.5: technical survey + bureaucratic check, each with three
// possible outcomes. PENDING means not yet decided.
export const CHECK_OUTCOMES = [
  "PENDING",
  "OK",
  "INTEGRATION_NEEDED",
  "NOT_DOABLE",
] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

const contractSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    territoryId: { type: Schema.Types.ObjectId, ref: "Territory", default: null, index: true },
    solutionVersionId: {
      type: Schema.Types.ObjectId,
      ref: "SolutionVersion",
      required: true,
    },
    amountCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "EUR" },
    // Per Review 1.0 §3,§6: payment method affects commission base
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "ONE_TIME",
      index: true,
    },
    advanceCents: { type: Number, default: 0, min: 0 }, // for ADVANCE_INSTALLMENTS
    installmentPlanId: {
      type: Schema.Types.ObjectId,
      ref: "InstallmentPlan",
      default: null,
    },
    installmentMonths: { type: Number, default: null }, // denormalised from plan at creation
    installmentAmountCents: { type: Number, default: null }, // derived
    status: { type: String, enum: CONTRACT_STATUSES, default: "DRAFT", index: true },
    signedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, default: "" },
    // Per Review 1.0 §5: All contracts must be approved by an Admin or Area Manager.
    // signedScanDocumentId — the uploaded customer-signed scan; required before approval.
    // approvedAt / approvedBy — set when admin/AM verifies. Commissions only fire on approval
    // (when approvalRequired=true); legacy contracts with approvalRequired=false fire on sign().
    approvalRequired: { type: Boolean, default: true },
    signedScanDocumentId: { type: Schema.Types.ObjectId, ref: "Document", default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Per Review 1.1 §1: generation approval gate. Agent generates the PDF on the
    // contract page; admin/AM must approve it before agent can sign/print/upload-signed.
    generatedDocumentId: { type: Schema.Types.ObjectId, ref: "Document", default: null },
    generatedFromTemplateId: { type: Schema.Types.ObjectId, ref: "ContractTemplate", default: null },
    generationApprovedAt: { type: Date, default: null },
    generationApprovedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // Per Review 1.5 (2026-05-07): the spec adds an explicit "agent printed
    // the contract" milestone between APPROVED and SIGNED so the UI can swap
    // the "Print" button for "Upload signed contract".
    printedAt: { type: Date, default: null },

    // Per Review 1.5: agent picks the contract date + first-installment start
    // date when launching the Generate flow. Stored alongside the contract so
    // the generated PDF can render them and the admin payment panel can
    // schedule installments off them.
    contractStartDate: { type: Date, default: null },
    installmentStartDate: { type: Date, default: null },

    // Per Review 1.5: house this contract is tied to. Nullable because not
    // all contracts have a fulfilled house at generate time (agent fulfils
    // 4 sections progressively).
    houseId: { type: Schema.Types.ObjectId, ref: "House", default: null, index: true },

    // Per Review 1.5: technical survey + administrative bureaucratic check,
    // both planned and decided by admin after signing. Outcomes drive the
    // pre-installation flow (OK → installation; INTEGRATION_NEEDED → revised
    // doc to agent; NOT_DOABLE → contract closed).
    technicalSurvey: {
      outcome: {
        type: String,
        enum: CHECK_OUTCOMES,
        default: "PENDING",
      },
      plannedAt: { type: Date, default: null },
      decidedAt: { type: Date, default: null },
      decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
      notes: { type: String, default: "" },
    },
    administrativeCheck: {
      outcome: {
        type: String,
        enum: CHECK_OUTCOMES,
        default: "PENDING",
      },
      plannedAt: { type: Date, default: null },
      decidedAt: { type: Date, default: null },
      decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
      notes: { type: String, default: "" },
    },

    // Per Review 1.5: when an outcome is INTEGRATION_NEEDED, admin sets a
    // separate integration price. NOT summed into amountCents because it
    // may need to be paid in advance and not follow the installment plan.
    integrationAmountCents: { type: Number, default: 0, min: 0 },
    integrationDocumentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },
    integrationAcceptedAt: { type: Date, default: null },
    integrationDeclinedAt: { type: Date, default: null },

    // Per Review 1.5: pre-installation requirement. The cambiale (Italian
    // promissory note / guarantee) is required when ANY form of installments
    // is involved before installation can be planned.
    cambialeDocumentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
    },

    // Per Review 1.5: installation milestones planned by admin.
    installationPlannedFor: { type: Date, default: null },
  },
  { timestamps: true }
);

contractSchema.index({ status: 1, signedAt: -1 });
contractSchema.index({ agentId: 1, status: 1 });

export type ContractDoc = InferSchemaType<typeof contractSchema> & {
  _id: Schema.Types.ObjectId;
};
export const Contract: Model<ContractDoc> = model<ContractDoc>("Contract", contractSchema);
