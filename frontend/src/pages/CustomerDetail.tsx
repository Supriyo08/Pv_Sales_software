import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCog, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { CustomerNotes } from "../components/CustomerNotes";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { formatCents, formatDate } from "../lib/format";
import { useRole, useAuth, decodeUserId } from "../store/auth";
import type { Customer, CommissionSplit, Contract, User } from "../lib/api-types";

type SplitDraft = {
  enabled: boolean;
  agentSplits: { userId: string; pct: number }[];
  bonusCountBeneficiaryId: string;
  managerBonusBeneficiaryId: string;
  managerOverrideBeneficiaryId: string;
};

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
  const [split, setSplit] = useState<SplitDraft>({
    enabled: false,
    agentSplits: [],
    bonusCountBeneficiaryId: "",
    managerBonusBeneficiaryId: "",
    managerOverrideBeneficiaryId: "",
  });

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

  const eligibleManagers = users.filter(
    (u) => u.role === "AREA_MANAGER" || u.role === "ADMIN"
  );

  const reassign = useMutation({
    mutationFn: async (input: {
      agentId: string | null;
      commissionSplit?: CommissionSplit | null;
    }) => api.patch(`/customers/${id}/assign`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer", id] });
      qc.invalidateQueries({ queryKey: ["customers", ""] });
      setShowAssign(false);
      setPickedAgentId("");
      setSplit({
        enabled: false,
        agentSplits: [],
        bonusCountBeneficiaryId: "",
        managerBonusBeneficiaryId: "",
        managerOverrideBeneficiaryId: "",
      });
      setAssignError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setAssignError(err?.response?.data?.error ?? "Failed"),
  });

  const splitTotal = split.agentSplits.reduce((acc, e) => acc + e.pct, 0);

  const handleSave = () => {
    const agentId = pickedAgentId === "__unassign__" ? null : pickedAgentId || null;
    if (!split.enabled) {
      reassign.mutate({ agentId, commissionSplit: null });
      return;
    }
    if (split.agentSplits.length === 0) {
      setAssignError("Add at least one agent to the split");
      return;
    }
    if (Math.round(splitTotal * 100) !== 10000) {
      setAssignError(`Splits must sum to 100% (currently ${splitTotal.toFixed(2)}%)`);
      return;
    }
    reassign.mutate({
      agentId,
      commissionSplit: {
        agentSplits: split.agentSplits.map((e) => ({
          userId: e.userId,
          bp: Math.round(e.pct * 100),
        })),
        bonusCountBeneficiaryId: split.bonusCountBeneficiaryId || null,
        managerBonusBeneficiaryId: split.managerBonusBeneficiaryId || null,
        managerOverrideBeneficiaryId: split.managerOverrideBeneficiaryId || null,
      },
    });
  };

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

          {customer.commissionSplit && (
            <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3 text-xs space-y-1">
              <div className="font-semibold text-brand-900">
                Commission split active (applies to future contracts)
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {customer.commissionSplit.agentSplits.map((s) => (
                  <Badge key={s.userId} tone="brand">
                    {userById.get(s.userId)?.fullName ?? s.userId.slice(-6)} · {s.bp / 100}%
                  </Badge>
                ))}
              </div>
              {customer.commissionSplit.bonusCountBeneficiaryId && (
                <div className="text-brand-800">
                  Bonus count →{" "}
                  {userById.get(customer.commissionSplit.bonusCountBeneficiaryId)?.fullName ??
                    "—"}
                </div>
              )}
              {customer.commissionSplit.managerBonusBeneficiaryId && (
                <div className="text-brand-800">
                  Manager bonus →{" "}
                  {userById.get(customer.commissionSplit.managerBonusBeneficiaryId)?.fullName ??
                    "—"}
                </div>
              )}
              {customer.commissionSplit.managerOverrideBeneficiaryId && (
                <div className="text-brand-800">
                  Manager override →{" "}
                  {userById.get(customer.commissionSplit.managerOverrideBeneficiaryId)
                    ?.fullName ?? "—"}
                </div>
              )}
            </div>
          )}

          {showAssign && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <Field
                label="Reassign to agent (primary)"
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
                  <option value="">— keep current —</option>
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

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={split.enabled}
                  onChange={(e) =>
                    setSplit((s) => ({ ...s, enabled: e.target.checked }))
                  }
                  className="size-3.5 rounded border-slate-300"
                />
                Configure commission split (Review 1.1 §6 — applies to future contracts)
              </label>

              {split.enabled && (
                <div className="rounded border border-slate-200 bg-white p-3 space-y-3">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700">
                      Agents (sum must = 100%)
                    </div>
                    {split.agentSplits.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Select
                          value={entry.userId}
                          onChange={(e) =>
                            setSplit((s) => ({
                              ...s,
                              agentSplits: s.agentSplits.map((x, i) =>
                                i === idx ? { ...x, userId: e.target.value } : x
                              ),
                            }))
                          }
                        >
                          <option value="">— pick agent —</option>
                          {eligibleAgents.map((a) => (
                            <option key={a._id} value={a._id}>
                              {a.fullName}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={entry.pct}
                          onChange={(e) =>
                            setSplit((s) => ({
                              ...s,
                              agentSplits: s.agentSplits.map((x, i) =>
                                i === idx ? { ...x, pct: Number(e.target.value) || 0 } : x
                              ),
                            }))
                          }
                          className="w-24"
                        />
                        <span className="text-xs text-slate-500">%</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSplit((s) => ({
                              ...s,
                              agentSplits: s.agentSplits.filter((_, i) => i !== idx),
                            }))
                          }
                          className="text-red-500 hover:text-red-700"
                          title="Remove"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setSplit((s) => ({
                            ...s,
                            agentSplits: [...s.agentSplits, { userId: "", pct: 0 }],
                          }))
                        }
                        className="text-xs text-brand-600 hover:text-brand-700"
                      >
                        + Add agent
                      </button>
                      <span
                        className={`text-xs ${
                          Math.round(splitTotal * 100) === 10000
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }`}
                      >
                        Total: {splitTotal.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <Field
                    label="Bonus count beneficiary"
                    hint="Which agent counts this customer's contracts toward bonus thresholds. Defaults to first split agent."
                  >
                    <Select
                      value={split.bonusCountBeneficiaryId}
                      onChange={(e) =>
                        setSplit((s) => ({
                          ...s,
                          bonusCountBeneficiaryId: e.target.value,
                        }))
                      }
                    >
                      <option value="">— default (primary agent) —</option>
                      {split.agentSplits
                        .filter((e) => e.userId)
                        .map((e) => (
                          <option key={e.userId} value={e.userId}>
                            {userById.get(e.userId)?.fullName ?? e.userId}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Manager bonus beneficiary" hint="Which AM gets the bonus count credit.">
                    <Select
                      value={split.managerBonusBeneficiaryId}
                      onChange={(e) =>
                        setSplit((s) => ({
                          ...s,
                          managerBonusBeneficiaryId: e.target.value,
                        }))
                      }
                    >
                      <option value="">— default (chain from primary agent) —</option>
                      {eligibleManagers.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.fullName} ({m.role})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Manager override beneficiary" hint="Which AM receives the override commission.">
                    <Select
                      value={split.managerOverrideBeneficiaryId}
                      onChange={(e) =>
                        setSplit((s) => ({
                          ...s,
                          managerOverrideBeneficiaryId: e.target.value,
                        }))
                      }
                    >
                      <option value="">— default (chain from primary agent) —</option>
                      {eligibleManagers.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.fullName} ({m.role})
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}

              {assignError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {assignError}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" loading={reassign.isPending} onClick={handleSave}>
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

      {/* Per Review 1.5 (2026-05-04): customer chat — admin/AM/agent leave
          notes with author + timestamp. */}
      <div className="mt-6">
        <CustomerNotes customerId={customer._id} />
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
