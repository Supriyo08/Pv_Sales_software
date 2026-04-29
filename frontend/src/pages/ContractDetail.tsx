import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, RefreshCw, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { formatCents, formatDate, formatDateTime } from "../lib/format";
import { useRole } from "../store/auth";
import type {
  Contract,
  Customer,
  Installation,
  Commission,
  User,
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
    mutationFn: async (status: string) =>
      api.post(`/installations/${installation!._id}/transition`, { status }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const recalc = useMutation({
    mutationFn: async () =>
      api.post(`/commissions/recalc/contract/${id}`, { reason: "manual recalc from UI" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commissions"] }),
  });

  if (!contract) return <p className="text-slate-500">Loading…</p>;

  const canSign = contract.status === "DRAFT" && (role === "ADMIN" || role === "AREA_MANAGER");
  const canCancel = contract.status !== "CANCELLED" && (role === "ADMIN" || role === "AREA_MANAGER");
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
          </span>
        }
        action={
          <div className="flex gap-2">
            {canSign && (
              <Button
                onClick={() => sign.mutate()}
                loading={sign.isPending}
                icon={<CheckCircle2 className="size-4" />}
              >
                Sign contract
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

      <div className="grid gap-6 lg:grid-cols-2">
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
            <Row k="Cancelled">{formatDateTime(contract.cancelledAt)}</Row>
            {contract.cancellationReason && (
              <Row k="Cancel reason">{contract.cancellationReason}</Row>
            )}
          </dl>
        </Card>

        <Card padding={false}>
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold">Installation</h3>
            {installation && nextInstallStatus && (role === "ADMIN" || role === "AREA_MANAGER") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => transition.mutate(nextInstallStatus)}
                loading={transition.isPending}
                icon={<ArrowRight className="size-3.5" />}
              >
                Advance to {nextInstallStatus}
              </Button>
            )}
          </div>
          <div className="p-6">
            {!installation ? (
              <p className="text-sm text-slate-500">Sign the contract to create an installation.</p>
            ) : (
              <>
                <dl className="space-y-3 text-sm mb-4">
                  <Row k="Status">
                    <StatusBadge status={installation.status} />
                  </Row>
                  <Row k="Activated">{formatDate(installation.activatedAt)}</Row>
                </dl>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
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
