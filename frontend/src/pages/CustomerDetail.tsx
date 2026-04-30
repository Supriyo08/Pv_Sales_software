import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCog } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Select } from "../components/ui/Input";
import { StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { formatCents, formatDate } from "../lib/format";
import { useRole, useAuth, decodeUserId } from "../store/auth";
import type { Customer, Contract, User } from "../lib/api-types";

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const role = useRole();
  const token = useAuth((s) => s.accessToken);
  const myId = decodeUserId(token);
  const qc = useQueryClient();
  const canReassign = role === "ADMIN" || role === "AREA_MANAGER";
  const [showAssign, setShowAssign] = useState(false);
  const [pickedAgentId, setPickedAgentId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  const { data: customer } = useQuery<Customer>({
    queryKey: ["customer", id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data,
    enabled: !!id,
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["contracts", { customerId: id }],
    queryFn: async () =>
      (await api.get("/contracts")).data.filter((c: Contract) => c.customerId === id),
    enabled: !!id,
  });

  // Eligible agents the current user can reassign to.
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
    enabled: canReassign,
  });
  const eligibleAgents = users.filter((u) => {
    if (u.role !== "AGENT") return false;
    if (role === "ADMIN") return true;
    // AREA_MANAGER: only their own agents
    return u.managerId === myId;
  });
  const userById = new Map(users.map((u) => [u._id, u]));

  const reassign = useMutation({
    mutationFn: async (agentId: string | null) =>
      api.patch(`/customers/${id}/assign`, { agentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers", ""] });
      setShowAssign(false);
      setPickedAgentId("");
      setAssignError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setAssignError(err?.response?.data?.error ?? "Failed"),
  });

  if (!customer) return <p className="text-slate-500">Loading…</p>;

  const currentAssignee = customer.assignedAgentId
    ? userById.get(customer.assignedAgentId)
    : null;

  return (
    <div>
      <BackLink to="/customers">Back to customers</BackLink>
      <PageHeader
        title={customer.fullName}
        description={`Customer · ${customer.fiscalCode}`}
        action={
          <Button asChild icon={<Plus className="size-4" />}>
            <Link to={`/contracts/new?customerId=${customer._id}`}>New contract</Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold mb-4">Customer info</h3>
          <dl className="space-y-3 text-sm">
            <Row k="Fiscal code">
              <code className="font-mono text-xs">{customer.fiscalCode}</code>
            </Row>
            <Row k="Email">{customer.email || "—"}</Row>
            <Row k="Phone">{customer.phone || "—"}</Row>
            <Row k="Address">
              {[customer.address?.line1, customer.address?.city, customer.address?.postalCode]
                .filter(Boolean)
                .join(", ") || "—"}
            </Row>
            <Row k="Created">{formatDate(customer.createdAt)}</Row>
            <Row k="Assigned agent">
              <div className="flex items-center gap-2">
                <span>
                  {currentAssignee?.fullName ?? (
                    <span className="text-slate-400">unassigned</span>
                  )}
                </span>
                {canReassign && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<UserCog className="size-3.5" />}
                    onClick={() => setShowAssign(!showAssign)}
                  >
                    Reassign
                  </Button>
                )}
              </div>
            </Row>
          </dl>

          {showAssign && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <Field
                label="Reassign to agent"
                hint={
                  role === "AREA_MANAGER"
                    ? "Only agents in your network are listed."
                    : "Any active agent."
                }
              >
                <Select
                  value={pickedAgentId}
                  onChange={(e) => setPickedAgentId(e.target.value)}
                >
                  <option value="">— Select agent —</option>
                  {role === "ADMIN" && (
                    <option value="__unassign__">— Unassign (admins only) —</option>
                  )}
                  {eligibleAgents.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.fullName} ({a.email})
                    </option>
                  ))}
                </Select>
              </Field>
              {assignError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {assignError}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!pickedAgentId}
                  loading={reassign.isPending}
                  onClick={() =>
                    reassign.mutate(pickedAgentId === "__unassign__" ? null : pickedAgentId)
                  }
                >
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAssign(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card padding={false}>
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold">Contracts ({contracts.length})</h3>
          </div>
          {contracts.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500 text-center">No contracts yet.</p>
          ) : (
            <Table>
              <THead>
                <Th>ID</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {contracts.map((c) => (
                  <Tr key={c._id}>
                    <Td>
                      <Link
                        to={`/contracts/${c._id}`}
                        className="font-mono text-xs text-brand-600 hover:text-brand-700"
                      >
                        {c._id.slice(-8)}
                      </Link>
                    </Td>
                    <Td>{formatCents(c.amountCents, c.currency)}</Td>
                    <Td>
                      <StatusBadge status={c.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
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
