import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  Upload,
  ShieldCheck,
  PencilLine,
  FileText,
  FileCheck2,
} from "lucide-react";
import { api, uploadUrl } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { Modal } from "../components/ui/Modal";
import { Input, Textarea, Select, Field } from "../components/ui/Input";
import { DocxPreview } from "../components/DocxPreview";
import { DocumentActions } from "../components/DocumentActions";
import { ContractHistory } from "../components/ContractHistory";
import { formatCents, formatDate, formatDateTime } from "../lib/format";
import { useRole } from "../store/auth";
import type {
  Contract,
  ContractEditRequest,
  ContractPaymentMethod,
  ContractTemplate,
  Customer,
  Installation,
  Commission,
  DocumentRecord,
  User,
  Solution,
  SolutionVersion,
  InstallmentPlan,
} from "../lib/api-types";

const NEXT_INSTALL_STEPS: Record<string, string> = {
  SCHEDULED: "SURVEY",
  SURVEY: "PERMITS",
  PERMITS: "INSTALLED",
  INSTALLED: "ACTIVATED",
  ACTIVATED: "INSPECTED",
};

export function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const role = useRole();

  const { data: contract } = useQuery<Contract>({
    queryKey: ["contract", id],
    queryFn: async () => (await api.get(`/contracts/${id}`)).data,
    enabled: !!id,
  });

  const { data: customer } = useQuery<Customer>({
    queryKey: ["customer", contract?.customerId],
    queryFn: async () => (await api.get(`/customers/${contract!.customerId}`)).data,
    enabled: !!contract?.customerId,
  });

  const { data: agent } = useQuery<User>({
    queryKey: ["user", contract?.agentId],
    queryFn: async () => (await api.get(`/users/${contract!.agentId}`)).data,
    enabled: !!contract?.agentId && (role === "ADMIN" || role === "AREA_MANAGER"),
  });

  const { data: version } = useQuery<SolutionVersion>({
    queryKey: ["solution-version", contract?.solutionVersionId],
    queryFn: async () =>
      (await api.get(`/catalog/solution-versions/${contract!.solutionVersionId}`)).data,
    enabled: !!contract?.solutionVersionId,
  });

  const { data: solution } = useQuery<Solution>({
    queryKey: ["solution", version?.solutionId],
    queryFn: async () => (await api.get(`/catalog/solutions/${version!.solutionId}`)).data,
    enabled: !!version?.solutionId,
  });

  const { data: plan } = useQuery<InstallmentPlan>({
    queryKey: ["installment-plan", contract?.installmentPlanId],
    queryFn: async () =>
      (await api.get(`/catalog/installment-plans/${contract!.installmentPlanId}`)).data,
    enabled: !!contract?.installmentPlanId,
  });

  const { data: installations = [] } = useQuery<Installation[]>({
    queryKey: ["installations"],
    queryFn: async () => (await api.get("/installations")).data,
  });
  const installation = installations.find((i) => i.contractId === id);

  const { data: commissions = [] } = useQuery<Commission[]>({
    queryKey: ["commissions", { contractId: id }],
    queryFn: async () =>
      (await api.get("/commissions", { params: { contractId: id, active: "true" } })).data,
    enabled: !!id,
  });

  const sign = useMutation({
    mutationFn: async () => api.post(`/contracts/${id}/sign`),
    onSuccess: () => qc.invalidateQueries(),
  });

  const cancel = useMutation({
    mutationFn: async () => api.post(`/contracts/${id}/cancel`, { reason: "cancelled from UI" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const transition = useMutation({
    mutationFn: async (input: { status: string; occurredAt?: string }) =>
      api.post(`/installations/${installation!._id}/transition`, {
        status: input.status,
        occurredAt: input.occurredAt
          ? new Date(input.occurredAt + "T12:00:00").toISOString()
          : undefined,
      }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const recalc = useMutation({
    mutationFn: async () =>
      api.post(`/commissions/recalc/contract/${id}`, { reason: "manual recalc from UI" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commissions"] }),
  });

  // Per Review 1.1 §1: edit-request workflow.
  const { data: plans = [] } = useQuery<InstallmentPlan[]>({
    queryKey: ["installment-plans", "active"],
    queryFn: async () =>
      (await api.get("/catalog/installment-plans", { params: { active: "true" } })).data,
  });

  const { data: editRequests = [] } = useQuery<ContractEditRequest[]>({
    queryKey: ["contract-edit-requests", { contractId: id }],
    queryFn: async () =>
      (
        await api.get("/contract-edit-requests", { params: { contractId: id } })
      ).data,
    enabled: !!id,
  });

  const pendingEdit = editRequests.find((r) => r.status === "PENDING");

  const [editOpen, setEditOpen] = useState(false);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<ContractPaymentMethod | "">("");
  const [editAdvance, setEditAdvance] = useState<string>("");
  const [editPlanId, setEditPlanId] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");

  const submitEdit = useMutation({
    mutationFn: async () => {
      const changes: Record<string, unknown> = {};
      if (editAmount && Number(editAmount) * 100 !== contract!.amountCents) {
        changes.amountCents = Math.round(Number(editAmount) * 100);
      }
      if (editPaymentMethod && editPaymentMethod !== contract!.paymentMethod) {
        changes.paymentMethod = editPaymentMethod;
      }
      if (
        editAdvance &&
        Math.round(Number(editAdvance) * 100) !== contract!.advanceCents
      ) {
        changes.advanceCents = Math.round(Number(editAdvance) * 100);
      }
      if (editPlanId !== "" && editPlanId !== (contract!.installmentPlanId ?? "")) {
        changes.installmentPlanId = editPlanId === "__none__" ? null : editPlanId;
      }
      if (Object.keys(changes).length === 0) {
        throw new Error("No changes detected");
      }
      return api.post(`/contracts/${id}/edit-requests`, {
        changes,
        reason: editReason,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-edit-requests"] });
      setEditOpen(false);
      setEditReason("");
    },
  });

  const decideEdit = useMutation({
    mutationFn: async (input: { id: string; action: "approve" | "reject"; note: string }) =>
      api.post(`/contract-edit-requests/${input.id}/${input.action}`, { note: input.note }),
    onSuccess: () => qc.invalidateQueries(),
  });

  function openEditModal() {
    if (!contract) return;
    setEditAmount((contract.amountCents / 100).toFixed(2));
    setEditPaymentMethod(contract.paymentMethod);
    setEditAdvance((contract.advanceCents / 100).toFixed(2));
    setEditPlanId(contract.installmentPlanId ?? "__none__");
    setEditReason("");
    setEditOpen(true);
  }

  // Per Review 1.1 §1: agent generates contract PDF; admin/AM approves before sign.
  const { data: templates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["templates", "active"],
    queryFn: async () => (await api.get("/templates")).data,
  });

  const [generateOpen, setGenerateOpen] = useState(false);
  const [selTemplateId, setSelTemplateId] = useState<string>("");
  const [tplValues, setTplValues] = useState<Record<string, string>>({});

  const selTemplate = templates.find((t) => t._id === selTemplateId);

  const generate = useMutation({
    mutationFn: async () => {
      if (!selTemplateId) throw new Error("Pick a template");
      return api.post(`/contracts/${id}/generate`, {
        templateId: selTemplateId,
        values: tplValues,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setGenerateOpen(false);
      setSelTemplateId("");
      setTplValues({});
    },
  });

  const approveGen = useMutation({
    mutationFn: async () => api.post(`/contracts/${id}/approve-generated`),
    onSuccess: () => qc.invalidateQueries(),
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadScan = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ownerType", "Contract");
      fd.append("ownerId", id!);
      fd.append("kind", "CONTRACT_PDF");
      const { data } = await api.post<DocumentRecord>("/documents/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return api.post(`/contracts/${id}/upload-signed`, { documentId: data._id });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setUploadError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setUploadError(err?.response?.data?.error ?? "Upload failed"),
  });

  const approve = useMutation({
    mutationFn: async () => api.post(`/contracts/${id}/approve`),
    onSuccess: () => qc.invalidateQueries(),
  });

  const { data: scanDocs = [] } = useQuery<DocumentRecord[]>({
    queryKey: ["contract-docs", id],
    queryFn: async () =>
      (
        await api.get("/documents", {
          params: { ownerType: "Contract", ownerId: id },
        })
      ).data,
    enabled: !!id,
  });

  if (!contract) return <p className="text-slate-500">Loading…</p>;

  const generationPending =
    !!contract.generatedDocumentId && !contract.generationApprovedAt;
  const canSign =
    contract.status === "DRAFT" && !generationPending;
  const canCancel = contract.status !== "CANCELLED" && (role === "ADMIN" || role === "AREA_MANAGER");
  const canRequestEdit = contract.status !== "CANCELLED" && !pendingEdit;
  const canDecideEdit = !!pendingEdit && (role === "ADMIN" || role === "AREA_MANAGER");
  const canGenerate = contract.status === "DRAFT";
  const canApproveGen =
    generationPending && (role === "ADMIN" || role === "AREA_MANAGER");
  const generatedDoc = scanDocs.find(
    (d) => d._id === contract.generatedDocumentId
  );
  const canUpload =
    contract.status === "SIGNED" &&
    contract.approvalRequired &&
    !contract.approvedAt;
  const canApprove =
    contract.status === "SIGNED" &&
    contract.approvalRequired &&
    !contract.approvedAt &&
    !!contract.signedScanDocumentId &&
    (role === "ADMIN" || role === "AREA_MANAGER");
  const nextInstallStatus = installation ? NEXT_INSTALL_STEPS[installation.status] : null;

  return (
    <div>
      <BackLink to="/contracts">Back to contracts</BackLink>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span>Contract</span>
            <code className="text-sm font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-700">
              {contract._id.slice(-8)}
            </code>
            <StatusBadge status={contract.status} />
            {contract.approvalRequired && contract.status === "SIGNED" && (
              contract.approvedAt ? (
                <Badge tone="green">approved</Badge>
              ) : contract.signedScanDocumentId ? (
                <Badge tone="amber">awaiting approval</Badge>
              ) : (
                <Badge tone="amber">awaiting signed scan</Badge>
              )
            )}
            {pendingEdit && <Badge tone="amber">edit requested</Badge>}
            {generationPending && <Badge tone="amber">generation pending</Badge>}
            {contract.generationApprovedAt && (
              <Badge tone="green">generation approved</Badge>
            )}
          </span>
        }
        action={
          <div className="flex gap-2">
            {canRequestEdit && (
              <Button
                variant="outline"
                onClick={openEditModal}
                icon={<PencilLine className="size-4" />}
              >
                Request edit
              </Button>
            )}
            {canGenerate && (
              <Button
                variant="outline"
                onClick={() => setGenerateOpen(true)}
                icon={<FileText className="size-4" />}
              >
                {contract.generatedDocumentId ? "Re-generate" : "Generate contract"}
              </Button>
            )}
            {canApproveGen && (
              <Button
                onClick={() => approveGen.mutate()}
                loading={approveGen.isPending}
                icon={<FileCheck2 className="size-4" />}
              >
                Approve generated PDF
              </Button>
            )}
            {canSign && (
              <Button
                onClick={() => sign.mutate()}
                loading={sign.isPending}
                icon={<CheckCircle2 className="size-4" />}
              >
                Sign contract
              </Button>
            )}
            {canApprove && (
              <Button
                onClick={() => approve.mutate()}
                loading={approve.isPending}
                icon={<ShieldCheck className="size-4" />}
              >
                Approve & generate commissions
              </Button>
            )}
            {canCancel && (
              <Button
                onClick={() => cancel.mutate()}
                loading={cancel.isPending}
                variant="danger"
                icon={<XCircle className="size-4" />}
              >
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {generationPending && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <FileText className="size-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900 mb-1">
                Generated contract awaiting approval
              </div>
              <p className="text-sm text-amber-800 mb-3">
                Admin or area manager must review the generated contract before you
                can print or sign it. Once approved, you'll see a "Sign" action.
              </p>
            </div>
          </div>
        </Card>
      )}

      {contract.generationApprovedAt && contract.status === "DRAFT" && (
        <Card className="mb-6 border-green-200 bg-green-50">
          <div className="flex items-start gap-3">
            <FileCheck2 className="size-5 text-green-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-green-900 mb-1">
                Generated contract approved — ready to sign
              </div>
              <p className="text-sm text-green-900">
                Print or download below, sign with the customer, then upload the
                signed scan for final approval.
              </p>
            </div>
          </div>
        </Card>
      )}

      {generatedDoc && (() => {
        // Per Review 1.2 (2026-05-04): an agent can VIEW the generated contract
        // and request edits, but the print/download toolbar stays hidden until
        // an admin/AM approves the generated PDF. Admins + AMs always see the
        // toolbar so they can review the document offline if needed.
        const isPrivileged = role === "ADMIN" || role === "AREA_MANAGER";
        const canShowActions = !!contract.generationApprovedAt || isPrivileged;
        return (
          <Card padding={false} className="mb-6">
            <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  Generated contract
                  {generatedDoc.mimeType?.includes("word") ? (
                    <Badge tone="brand">Word .docx</Badge>
                  ) : (
                    <Badge tone="neutral">PDF</Badge>
                  )}
                  {!contract.generationApprovedAt && (
                    <Badge tone="amber">awaiting approval</Badge>
                  )}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {canShowActions
                    ? "Rendered exactly as the source — print or download for the customer signature."
                    : "View the rendered contract below and request edits if needed. Print + download unlock once admin approves."}
                </p>
              </div>
              {canShowActions ? (
                <DocumentActions
                  src={uploadUrl(generatedDoc.url)}
                  mimeType={generatedDoc.mimeType ?? ""}
                  baseFilename={`contract-${contract._id.slice(-8)}`}
                  printableSelector="#contract-generated-preview .docx-preview-content"
                  // Per Review 1.5 follow-up (2026-05-07): server-side
                  // LibreOffice conversion gives byte-perfect PDF output.
                  serverPdfPath={`/contracts/${contract._id}/generated.pdf`}
                />
              ) : (
                <Badge tone="amber">Print/download locked until admin approves</Badge>
              )}
            </div>
            <div id="contract-generated-preview">
              {generatedDoc.mimeType?.includes("word") ? (
                <DocxPreview src={uploadUrl(generatedDoc.url)} flat />
              ) : (
                <iframe
                  src={uploadUrl(generatedDoc.url)}
                  title="Generated contract PDF"
                  className="w-full h-[80vh] border-0"
                />
              )}
            </div>
          </Card>
        );
      })()}

      {pendingEdit && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <PencilLine className="size-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900 mb-1">
                Pending edit request
              </div>
              <p className="text-sm text-amber-800 mb-2">
                Submitted {formatDateTime(pendingEdit.createdAt)}.
                {pendingEdit.reason ? ` Reason: ${pendingEdit.reason}` : ""}
              </p>
              <ul className="text-sm text-amber-900 mb-3 list-disc pl-5">
                {Object.entries(pendingEdit.changes).map(([k, v]) => (
                  <li key={k}>
                    <code className="font-mono text-xs">{k}</code>
                    {": "}
                    <strong>
                      {k === "amountCents" || k === "advanceCents"
                        ? formatCents(Number(v) || 0, contract.currency)
                        : String(v)}
                    </strong>
                  </li>
                ))}
              </ul>
              {canDecideEdit && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      decideEdit.mutate({
                        id: pendingEdit._id,
                        action: "approve",
                        note: "approved from contract detail",
                      })
                    }
                    loading={decideEdit.isPending}
                    icon={<CheckCircle2 className="size-3.5" />}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      const note = window.prompt("Reason for rejection?") ?? "";
                      decideEdit.mutate({
                        id: pendingEdit._id,
                        action: "reject",
                        note,
                      });
                    }}
                    loading={decideEdit.isPending}
                    icon={<XCircle className="size-3.5" />}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {canUpload && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <Upload className="size-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900 mb-1">
                {contract.signedScanDocumentId
                  ? "Signed scan attached — replace if needed"
                  : "Customer-signed scan required"}
              </div>
              <p className="text-sm text-amber-800 mb-3">
                Upload the customer-signed contract scan. An admin or area manager will then
                verify signatures and approve. Commissions are generated only on approval.
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadScan.mutate(file);
                  }}
                />
                {uploadScan.isPending && <span className="text-sm text-amber-700">Uploading…</span>}
              </div>
              {uploadError && (
                <div className="mt-2 text-sm text-red-700">{uploadError}</div>
              )}
              {scanDocs.length > 0 && (
                <div className="mt-3 text-xs text-amber-800">
                  Uploaded scans:{" "}
                  {scanDocs.map((d) => (
                    <a
                      key={d._id}
                      href={`http://localhost:4000${d.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline mr-2"
                    >
                      {d._id.slice(-8)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h3 className="font-semibold mb-4">Details</h3>
          <dl className="space-y-3 text-sm">
            <Row k="Amount">
              <span className="font-semibold text-slate-900">
                {formatCents(contract.amountCents, contract.currency)}
              </span>
            </Row>
            <Row k="Customer">{customer?.fullName ?? "—"}</Row>
            <Row k="Agent">{agent?.fullName ?? <code className="font-mono text-xs">{contract.agentId.slice(-8)}</code>}</Row>
            <Row k="Created">{formatDateTime(contract.createdAt)}</Row>
            <Row k="Signed">{formatDateTime(contract.signedAt)}</Row>
            <Row k="Approved">
              {contract.approvedAt ? (
                formatDateTime(contract.approvedAt)
              ) : contract.approvalRequired ? (
                <span className="text-amber-700">pending</span>
              ) : (
                <span className="text-slate-400">not required</span>
              )}
            </Row>
            <Row k="Cancelled">{formatDateTime(contract.cancelledAt)}</Row>
            {contract.cancellationReason && (
              <Row k="Cancel reason">{contract.cancellationReason}</Row>
            )}
          </dl>
        </Card>

        <Card>
          <h3 className="font-semibold mb-4">Solution &amp; payment</h3>
          <dl className="space-y-3 text-sm">
            <Row k="Solution">
              {solution ? (
                solution.name
              ) : (
                <span className="text-slate-400">loading…</span>
              )}
            </Row>
            <Row k="Version">
              {version ? (
                <span>
                  {formatDate(version.validFrom)}
                  {version.validTo ? ` → ${formatDate(version.validTo)}` : " → present"}
                </span>
              ) : (
                "—"
              )}
            </Row>
            {version?.changeReason && (
              <Row k="Change reason">
                <span className="text-slate-700">{version.changeReason}</span>
              </Row>
            )}
            <Row k="Base price">
              {version ? formatCents(version.basePriceCents, version.currency) : "—"}
            </Row>
            <Row k="Agent commission">
              {version ? `${(version.agentBp / 100).toFixed(2)}%` : "—"}
            </Row>
            <Row k="Manager override">
              {version ? `${(version.managerBp / 100).toFixed(2)}%` : "—"}
            </Row>
            <Row k="Payment method">
              <Badge tone="neutral">{contract.paymentMethod.replace(/_/g, " ")}</Badge>
            </Row>
            {contract.paymentMethod !== "ONE_TIME" && (
              <>
                <Row k="Plan">
                  {plan ? (
                    <span>
                      {plan.name} · {plan.months}&nbsp;mo
                    </span>
                  ) : contract.installmentPlanId ? (
                    <span className="text-slate-400">loading…</span>
                  ) : (
                    "—"
                  )}
                </Row>
                {contract.paymentMethod === "ADVANCE_INSTALLMENTS" && (
                  <Row k="Advance">
                    {formatCents(contract.advanceCents, contract.currency)}
                  </Row>
                )}
                {contract.installmentAmountCents !== null && (
                  <Row k="Per installment">
                    {formatCents(contract.installmentAmountCents, contract.currency)}
                    {contract.installmentMonths && (
                      <span className="text-slate-500"> · {contract.installmentMonths} months</span>
                    )}
                  </Row>
                )}
              </>
            )}
          </dl>
        </Card>

        <Card padding={false}>
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold">Installation</h3>
          </div>
          <div className="p-6">
            {!installation ? (
              <p className="text-sm text-slate-500">
                Sign the contract to create an installation.
              </p>
            ) : (
              <>
                <dl className="space-y-3 text-sm mb-4">
                  <Row k="Status">
                    <StatusBadge status={installation.status} />
                  </Row>
                  <Row k="Activated">{formatDate(installation.activatedAt)}</Row>
                </dl>
                {nextInstallStatus && (role === "ADMIN" || role === "AREA_MANAGER") && (
                  <AdvanceForm
                    nextStatus={nextInstallStatus}
                    onSubmit={(occurredAt) =>
                      transition.mutate({ status: nextInstallStatus, occurredAt })
                    }
                    pending={transition.isPending}
                  />
                )}
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-6 mb-2">
                  Milestones
                </h4>
                <ol className="relative pl-5 space-y-3 border-l border-slate-200">
                  {installation.milestones.map((m, i) => (
                    <li key={i} className="text-sm">
                      <span className="absolute -left-[5px] mt-1 size-2 rounded-full bg-brand-500" />
                      <div className="font-medium text-slate-900">{m.status}</div>
                      <div className="text-xs text-slate-500">{formatDateTime(m.date)}</div>
                      {m.notes && <div className="text-xs text-slate-600 mt-0.5">{m.notes}</div>}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card padding={false} className="mt-6">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold">Active commissions</h3>
          {role === "ADMIN" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => recalc.mutate()}
              loading={recalc.isPending}
              icon={<RefreshCw className="size-3.5" />}
            >
              Recalculate
            </Button>
          )}
        </div>
        {commissions.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500 text-center">No active commissions.</p>
        ) : (
          <Table>
            <THead>
              <Th>Beneficiary</Th>
              <Th>Role</Th>
              <Th>Source</Th>
              <Th>Amount</Th>
              <Th>Generated</Th>
            </THead>
            <TBody>
              {commissions.map((c) => (
                <Tr key={c._id}>
                  <Td>
                    <code className="text-xs font-mono">{c.beneficiaryUserId.slice(-8)}</code>
                  </Td>
                  <Td>
                    <StatusBadge status={c.beneficiaryRole} />
                  </Td>
                  <Td className="text-xs text-slate-600">{c.sourceEvent}</Td>
                  <Td className="font-semibold">{formatCents(c.amountCents, c.currency)}</Td>
                  <Td className="text-slate-500">{formatDateTime(c.generatedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Per Review 1.2 (2026-05-04): full chronological history of the contract. */}
      <Card padding={false} className="mt-6">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold">History</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Every event from creation through approvals, commissions, installation
            milestones and reversals — auto-refreshes every 30 s.
          </p>
        </div>
        <div className="px-8 py-6">
          <ContractHistory contractId={id!} />
        </div>
      </Card>

      <Modal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Request a contract edit"
        description="Admin or area manager will review and apply your changes. Only fields you modify are sent."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => submitEdit.mutate()} loading={submitEdit.isPending}>
              Submit request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {submitEdit.isError && (
            <p className="text-sm text-red-600">
              {(submitEdit.error as { response?: { data?: { error?: string } }; message?: string })
                ?.response?.data?.error ?? (submitEdit.error as Error).message}
            </p>
          )}
          <Field label={`Amount (${contract.currency})`}>
            <Input
              type="number"
              step="0.01"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
            />
          </Field>
          <Field label="Payment method">
            <Select
              value={editPaymentMethod}
              onChange={(e) =>
                setEditPaymentMethod(e.target.value as ContractPaymentMethod)
              }
            >
              <option value="ONE_TIME">One-time</option>
              <option value="ADVANCE_INSTALLMENTS">Advance + installments</option>
              <option value="FULL_INSTALLMENTS">Full installments</option>
            </Select>
          </Field>
          {editPaymentMethod !== "ONE_TIME" && (
            <Field label="Installment plan">
              <Select value={editPlanId} onChange={(e) => setEditPlanId(e.target.value)}>
                <option value="__none__">— select —</option>
                {plans
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} · {p.months} months
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          {editPaymentMethod === "ADVANCE_INSTALLMENTS" && (
            <Field label={`Advance (${contract.currency})`}>
              <Input
                type="number"
                step="0.01"
                value={editAdvance}
                onChange={(e) => setEditAdvance(e.target.value)}
              />
            </Field>
          )}
          <Field label="Reason for the change">
            <Textarea
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Why this edit is needed (visible to admin)"
              rows={3}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        title="Generate contract PDF"
        description="Pick a template and fill the placeholders. Admin will review the generated PDF before you can print or sign."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => generate.mutate()}
              loading={generate.isPending}
              disabled={!selTemplateId}
            >
              Generate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {generate.isError && (
            <p className="text-sm text-red-600">
              {(generate.error as { response?: { data?: { error?: string } }; message?: string })
                ?.response?.data?.error ?? (generate.error as Error).message}
            </p>
          )}
          <Field label="Template" required>
            <Select
              value={selTemplateId}
              onChange={(e) => {
                setSelTemplateId(e.target.value);
                setTplValues({});
              }}
            >
              <option value="">— select —</option>
              {templates
                .filter((t) => t.active)
                .map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>

          {selTemplate && selTemplate.analysis.placeholders.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Placeholders ({selTemplate.analysis.placeholders.length})
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {selTemplate.analysis.placeholders.map((p) => (
                  <Field key={p.tag} label={`@@${p.tag}`}>
                    <Input
                      value={tplValues[p.tag] ?? ""}
                      onChange={(e) =>
                        setTplValues((s) => ({ ...s, [p.tag]: e.target.value }))
                      }
                      placeholder={`value for @@${p.tag}`}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          {selTemplate &&
            selTemplate.analysis.placeholders.length === 0 && (
              <p className="text-sm text-slate-500">
                This template has no placeholders. Click Generate to render it as-is.
              </p>
            )}
          {selTemplate?.sourceDocxPath && (
            <p className="text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-md p-2">
              ✓ This template was uploaded as <strong>.docx</strong> — output will
              mirror the original Word formatting (fonts, tables, headers, images).
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex">
      <dt className="w-32 text-slate-500">{k}</dt>
      <dd className="flex-1 text-slate-900">{children}</dd>
    </div>
  );
}

function AdvanceForm({
  nextStatus,
  onSubmit,
  pending,
}: {
  nextStatus: string;
  onSubmit: (occurredAt: string | undefined) => void;
  pending: boolean;
}) {
  const [date, setDate] = useState<string>("");
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
      <div className="text-xs text-slate-600">
        Advance to <strong>{nextStatus}</strong>
        {nextStatus === "ACTIVATED" && (
          <span className="text-amber-700"> — date matters: bonus for that month uses this.</span>
        )}
      </div>
      <div className="flex gap-2 items-end">
        <label className="flex-1">
          <span className="block text-xs text-slate-500 mb-1">
            Milestone date {nextStatus === "ACTIVATED" ? "(activation)" : "(occurred at)"} —
            leave empty for today
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <Button
          size="sm"
          onClick={() => onSubmit(date || undefined)}
          loading={pending}
          icon={<ArrowRight className="size-3.5" />}
        >
          Advance
        </Button>
      </div>
    </div>
  );
}
