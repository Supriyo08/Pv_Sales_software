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

export type Customer = {
  _id: string;
  fiscalCode: string;
  fullName: string;
  email: string;
  phone: string;
  address?: { line1?: string; city?: string; postalCode?: string; country?: string };
  createdAt: string;
};

export type Solution = {
  _id: string;
  name: string;
  description: string;
  createdAt: string;
};

export type SolutionVersion = {
  _id: string;
  solutionId: string;
  validFrom: string;
  validTo: string | null;
  basePriceCents: number;
  currency: string;
  agentBp: number;
  managerBp: number;
  changeReason: string;
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
};

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
  createdAt: string;
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
