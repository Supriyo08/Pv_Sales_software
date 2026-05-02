export type Role = "ADMIN" | "AREA_MANAGER" | "AGENT";

export type User = {
  _id: string;
  email: string;
  fullName: string;
  role: Role;
  managerId: string | null;
  territoryId: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type CommissionSplit = {
  agentSplits: { userId: string; bp: number }[];
  bonusCountBeneficiaryId: string | null;
  managerBonusBeneficiaryId: string | null;
  managerOverrideBeneficiaryId: string | null;
};

export type Customer = {
  _id: string;
  fiscalCode: string;
  fullName: string;
  email: string;
  phone: string;
  address?: { line1?: string; city?: string; postalCode?: string; country?: string };
  assignedAgentId: string | null;
  // Per Review 1.1 §6.
  commissionSplit: CommissionSplit | null;
  createdAt: string;
};

export type Solution = {
  _id: string;
  name: string;
  description: string;
  // Per Review 1.1 §3.
  active: boolean;
  deletedAt: string | null;
  createdAt: string;
};

// Per Review 1.1 §3: enriched payload for the Solutions admin list.
export type SolutionEnriched = Solution & {
  activeVersion: {
    _id: string;
    basePriceCents: number;
    currency: string;
    agentBp: number;
    managerBp: number;
    changeReason: string;
  } | null;
  installmentPlans: { _id: string; name: string; months: number }[];
};

export type SolutionVersion = {
  _id: string;
  solutionId: string;
  validFrom: string;
  validTo: string | null;
  basePriceCents: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  currency: string;
  agentBp: number;
  managerBp: number;
  changeReason: string;
  active: boolean;
  boundToUserIds: string[];
  boundToTerritoryIds: string[];
  boundToCustomerIds: string[];
  createdAt: string;
};

export type BonusRule = {
  _id: string;
  name: string;
  role: Role;
  conditionType: string;
  threshold: number;
  basisPoints: number;
  validFrom: string;
  validTo: string | null;
  userId: string | null;
};

export type ContractPaymentMethod =
  | "ONE_TIME"
  | "ADVANCE_INSTALLMENTS"
  | "FULL_INSTALLMENTS";

export type Contract = {
  _id: string;
  customerId: string;
  agentId: string;
  managerId: string | null;
  solutionVersionId: string;
  amountCents: number;
  currency: string;
  status: "DRAFT" | "SIGNED" | "CANCELLED";
  signedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string;
  paymentMethod: ContractPaymentMethod;
  advanceCents: number;
  installmentPlanId: string | null;
  installmentMonths: number | null;
  installmentAmountCents: number | null;
  approvalRequired: boolean;
  signedScanDocumentId: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  // Per Review 1.1 §1: generation approval gate.
  generatedDocumentId: string | null;
  generatedFromTemplateId: string | null;
  generationApprovedAt: string | null;
  generationApprovedBy: string | null;
  createdAt: string;
};

export type CustomerFieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "number"
  | "select"
  | "textarea";

export type CustomerFormField = {
  key: string;
  label: string;
  type: CustomerFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  builtin?: boolean;
  order?: number;
};

export type CustomerFormConfig = {
  _id: string;
  fields: CustomerFormField[];
  updatedAt: string;
};

export type DocumentRecord = {
  _id: string;
  ownerType: string;
  ownerId: string;
  kind: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
};

export type InstallmentPlan = {
  _id: string;
  name: string;
  months: number;
  surchargeBp: number;
  description: string;
  active: boolean;
  // Per Review 1.1 §4: empty array = applies to all solutions.
  solutionIds: string[];
  advanceMinCents: number | null;
  advanceMaxCents: number | null;
  createdAt: string;
};

export type PriceApprovalRequest = {
  _id: string;
  customerId: string;
  agentId: string;
  solutionVersionId: string;
  requestedAmountCents: number;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  note: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  contractId: string | null;
  createdAt: string;
};

export type PricingStepRule = {
  variable: "panels" | "battery";
  thresholdKwh: number;
  addCents: number;
  label?: string;
};

export type PricingFormula = {
  _id: string;
  name: string;
  description: string;
  panelsBasePerKwhCents: number;
  batteryBasePerKwhCents: number;
  stepRules: PricingStepRule[];
  currency: string;
  active: boolean;
  createdAt: string;
};

export type QuoteResult = {
  panelsKwh: number;
  batteryKwh: number;
  panelsBaseCents: number;
  batteryBaseCents: number;
  steps: { label: string; addCents: number; matchedRule: PricingStepRule }[];
  totalCents: number;
  currency: string;
};

export type Installation = {
  _id: string;
  contractId: string;
  status: "SCHEDULED" | "SURVEY" | "PERMITS" | "INSTALLED" | "ACTIVATED" | "INSPECTED";
  milestones: { status: string; date: string; notes: string }[];
  activatedAt: string | null;
};

export type Commission = {
  _id: string;
  contractId: string | null;
  beneficiaryUserId: string;
  beneficiaryRole: Role;
  sourceEvent: string;
  amountCents: number;
  currency: string;
  period: string | null;
  supersededAt: string | null;
  reason: string;
  generatedAt: string;
};

export type Bonus = {
  _id: string;
  userId: string;
  period: string;
  ruleId: string;
  qualifierCount: number;
  baseAmountCents: number;
  basisPoints: number;
  bonusAmountCents: number;
  commissionId: string;
  createdAt: string;
};

export type Payment = {
  _id: string;
  userId: string;
  period: string;
  totalAmountCents: number;
  paidCents: number;
  currency: string;
  status: "PENDING" | "PARTIAL" | "FULL" | "DISPUTED" | "CANCELLED";
  cancelled: boolean;
  createdAt: string;
};

export type TransactionKind = "PAY" | "REFUND" | "DISPUTE" | "RESOLVE_DISPUTE";
export type PaymentMethod = "WIRE" | "CASH" | "CHECK" | "CARD" | "OTHER";

export type PaymentTransaction = {
  _id: string;
  paymentId: string;
  kind: TransactionKind;
  amountCents: number;
  method: PaymentMethod | null;
  referenceNumber: string | null;
  executedAt: string;
  proofUrl: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
};

export type AuditLog = {
  _id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AdvancePayAuthorization = {
  _id: string;
  contractId: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  status: "PENDING" | "AUTHORIZED" | "DECLINED" | "RESOLVED_BY_INSTALL";
  note: string;
  createdAt: string;
};

export type ReversalReview = {
  _id: string;
  kind: "COMMISSION" | "BONUS";
  subjectId: string;
  contractId: string;
  installationId: string;
  beneficiaryUserId: string;
  period: string | null;
  suggestedAction: "KEEP" | "REVERT" | "REDUCE";
  amountCents: number;
  currency: string;
  status: "PENDING" | "DECIDED";
  decision: "KEEP" | "REVERT" | "REDUCE" | null;
  reduceCents: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
};

export type ContractEditRequest = {
  _id: string;
  contractId: string;
  requestedBy: string;
  changes: {
    amountCents?: number;
    paymentMethod?: ContractPaymentMethod;
    advanceCents?: number;
    installmentPlanId?: string | null;
    solutionVersionId?: string;
  };
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
  updatedAt: string;
};

export type Notification = {
  _id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type Territory = {
  _id: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
};

export type ContractTemplate = {
  _id: string;
  name: string;
  description: string;
  body: string;
  active: boolean;
  // Per Review 1.1 §2: empty array = applies to all solutions.
  solutionIds: string[];
  // Per follow-up to Review 1.1 (2026-05-02): when set, contract generation
  // round-trips the original .docx so output mirrors the source's formatting.
  sourceDocxPath: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  analysis: {
    placeholders: { tag: string; count: number }[];
    sections: { id: string; label: string }[];
  };
};

export type TemplateRenderResult = {
  text: string;
  analysis: ContractTemplate["analysis"];
  missingPlaceholders: string[];
};
