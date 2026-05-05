import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Power, Calendar, FileSignature, X, Check, Grid3X3 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { PricingMatrixEditor } from "../components/PricingMatrixEditor";
import { formatCents, formatDate, formatDateTime, formatBp } from "../lib/format";
import { useRole } from "../store/auth";
import type {
  Contract,
  InstallmentPlan,
  Solution,
  SolutionVersion,
} from "../lib/api-types";

export function SolutionDetail() {
  const { id } = useParams<{ id: string }>();
  const role = useRole();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  // Per Review 1.3 (2026-05-04): default `validFrom` to today so admins don't
  // have to type the date every time. Editable, of course.
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [basePrice, setBasePrice] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [agentPct, setAgentPct] = useState("15");
  const [managerPct, setManagerPct] = useState("5");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: solution } = useQuery<Solution>({
    queryKey: ["solution", id],
    queryFn: async () => (await api.get(`/catalog/solutions/${id}`)).data,
    enabled: !!id,
  });

  const { data: versions = [] } = useQuery<SolutionVersion[]>({
    queryKey: ["solution-versions", id],
    queryFn: async () => (await api.get(`/catalog/solutions/${id}/versions`)).data,
    enabled: !!id,
  });

  // Per Review 1.2 (2026-05-04): linked installment plans + per-solution
  // dashboard. Admins manage plan attachments inline; agents/AMs see read-only.
  const { data: allPlans = [] } = useQuery<InstallmentPlan[]>({
    queryKey: ["installment-plans", "all"],
    queryFn: async () => (await api.get("/catalog/installment-plans")).data,
    enabled: !!id,
  });
  const linkedPlans = allPlans.filter(
    (p) => p.solutionIds && p.solutionIds.includes(id!)
  );
  const universalPlans = allPlans.filter(
    (p) => !p.solutionIds || p.solutionIds.length === 0
  );

  const togglePlanLink = useMutation({
    mutationFn: async (input: { plan: InstallmentPlan; link: boolean }) => {
      const next = input.link
        ? Array.from(new Set([...(input.plan.solutionIds ?? []), id!]))
        : (input.plan.solutionIds ?? []).filter((sid) => sid !== id);
      return api.patch(`/catalog/installment-plans/${input.plan._id}`, {
        solutionIds: next,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["installment-plans"] }),
  });

  type Dashboard = {
    summary: { _id: string; count: number; amountCents: number }[];
    totals: { count: number; amountCents: number };
    recent: Pick<
      Contract,
      | "_id"
      | "customerId"
      | "agentId"
      | "status"
      | "amountCents"
      | "currency"
      | "paymentMethod"
      | "signedAt"
      | "createdAt"
    >[];
  };
  const { data: dash } = useQuery<Dashboard>({
    queryKey: ["solution-dashboard", id],
    queryFn: async () =>
      (await api.get(`/catalog/solutions/${id}/dashboard`)).data,
    enabled: !!id,
  });

  // Per Review 1.1 §3 + §3 troubleshooting: prominently surface the change reason
  // of the currently-active version so admins immediately see "why did pricing change".
  const now = Date.now();
  const activeVersion = versions.find(
    (v) =>
      v.active &&
      new Date(v.validFrom).getTime() <= now &&
      (!v.validTo || new Date(v.validTo).getTime() > now)
  );

  const createVersion = useMutation({
    mutationFn: async () =>
      api.post(`/catalog/solutions/${id}/versions`, {
        validFrom: new Date(validFrom).toISOString(),
        basePriceCents: Math.round(parseFloat(basePrice) * 100),
        minPriceCents: minPrice ? Math.round(parseFloat(minPrice) * 100) : null,
        maxPriceCents: maxPrice ? Math.round(parseFloat(maxPrice) * 100) : null,
        agentBp: Math.round(parseFloat(agentPct) * 100),
        managerBp: Math.round(parseFloat(managerPct) * 100),
        changeReason: reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solution-versions", id] });
      setShowForm(false);
      setValidFrom(new Date().toISOString().slice(0, 10));
      setBasePrice("");
      setMinPrice("");
      setMaxPrice("");
      setReason("");
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (v: SolutionVersion) =>
      api.patch(`/catalog/solutions/${id}/versions/${v._id}`, { active: !v.active }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["solution-versions", id] }),
  });

  return (
    <div>
      <BackLink to="/solutions">Back to solutions</BackLink>
      <PageHeader
        title={solution?.name ?? "Solution"}
        description={solution?.description}
        action={
          role === "ADMIN" && !showForm ? (
            <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />}>
              New version
            </Button>
          ) : null
        }
      />

      {activeVersion && (
        <Card className="mb-6 border-brand-200 bg-brand-50/40">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-full bg-brand-100 grid place-items-center text-brand-700 text-sm font-semibold shrink-0">
              v
            </div>
            <div className="flex-1 text-sm">
              <div className="font-semibold text-slate-900 mb-0.5">
                Active version reason
              </div>
              <div className="text-slate-700">
                {activeVersion.changeReason || (
                  <span className="text-slate-400">— no reason recorded —</span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Active since {new Date(activeVersion.validFrom).toLocaleDateString()}
                {activeVersion.boundToUserIds.length +
                  activeVersion.boundToTerritoryIds.length +
                  activeVersion.boundToCustomerIds.length >
                  0 && (
                  <>
                    {" "}
                    · bound to{" "}
                    {activeVersion.boundToUserIds.length +
                      activeVersion.boundToTerritoryIds.length +
                      activeVersion.boundToCustomerIds.length}{" "}
                    target(s) — see "Inventory control" in the version table.
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <h3 className="font-semibold mb-4">New version</h3>
          <p className="text-sm text-slate-500 mb-4">
            This will close the previously open version (set its <code>validTo</code> to this version's <code>validFrom</code>).
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <Field label="Valid from" required>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                required
              />
            </Field>
            <Field label="Base price (EUR)" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                required
              />
            </Field>
            <Field label="Min price (EUR)" hint="Agents below this need approval. Blank = no minimum.">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </Field>
            <Field label="Max price (EUR)" hint="Agents above this need approval. Blank = no maximum.">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </Field>
            <Field label="Agent commission %" hint="Applied to the contract amount">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={agentPct}
                onChange={(e) => setAgentPct(e.target.value)}
              />
            </Field>
            <Field
              label="Manager override %"
              hint="Applied to the agent commission (additive — not deducted)"
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={managerPct}
                onChange={(e) => setManagerPct(e.target.value)}
              />
            </Field>
            <div className="col-span-2">
              <Field label="Change reason">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </div>
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => createVersion.mutate()} loading={createVersion.isPending}>
              Create version
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <Table>
          <THead>
            <Th>Valid from</Th>
            <Th>Valid to</Th>
            <Th>Base price</Th>
            <Th>Range</Th>
            <Th title="% of contract amount">Agent %</Th>
            <Th title="% of agent commission (additive)">Mgr override %</Th>
            <Th>Status</Th>
            <Th>Reason</Th>
            {role === "ADMIN" && <Th></Th>}
          </THead>
          <TBody>
            {versions.length === 0 && (
              <Tr>
                <Td colSpan={role === "ADMIN" ? 9 : 8}>
                  <span className="text-slate-500">No versions yet.</span>
                </Td>
              </Tr>
            )}
            {versions.map((v) => (
              <Tr key={v._id}>
                <Td>{formatDate(v.validFrom)}</Td>
                <Td>
                  {v.validTo ? formatDate(v.validTo) : <Badge tone="green">Open</Badge>}
                </Td>
                <Td className="font-medium">{formatCents(v.basePriceCents, v.currency)}</Td>
                <Td className="text-xs text-slate-600">
                  {v.minPriceCents !== null ? formatCents(v.minPriceCents) : "—"} →{" "}
                  {v.maxPriceCents !== null ? formatCents(v.maxPriceCents) : "—"}
                </Td>
                <Td>{formatBp(v.agentBp)}</Td>
                <Td>{formatBp(v.managerBp)}</Td>
                <Td>
                  {v.active ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Inactive</Badge>
                  )}
                  {(v.boundToUserIds?.length || v.boundToTerritoryIds?.length || v.boundToCustomerIds?.length) ? (
                    <div className="mt-1">
                      <Badge tone="amber">bound</Badge>
                    </div>
                  ) : null}
                </Td>
                <Td className="text-slate-500">
                  {v.changeReason || <span className="text-slate-400">—</span>}
                </Td>
                {role === "ADMIN" && (
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleActive.mutate(v)}
                      icon={<Power className="size-3.5" />}
                    >
                      {v.active ? "Deactivate" : "Activate"}
                    </Button>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* Per Review 1.2 (2026-05-04) + Figma: pricing matrix for the active version. */}
      {activeVersion && (
        <Card padding={false} className="mt-6">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold flex items-center gap-2">
              <Grid3X3 className="size-4" /> Pricing matrix
              <Badge tone="brand">active version</Badge>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              One unified editor for the (payment method × installment plan ×
              advance range) overrides — no jumping between sections.
            </p>
          </div>
          <div className="px-6 py-4">
            <PricingMatrixEditor
              solutionId={id!}
              version={activeVersion}
              plans={allPlans.filter(
                (p) =>
                  p.active &&
                  (!p.solutionIds ||
                    p.solutionIds.length === 0 ||
                    p.solutionIds.includes(id!))
              )}
              canEdit={role === "ADMIN"}
            />
          </div>
        </Card>
      )}

      {/* Per Review 1.2 (2026-05-04): linked installment plans on the same page. */}
      <Card padding={false} className="mt-6">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Calendar className="size-4" /> Available installment plans
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Plans an agent can pick when creating a contract for this
              solution. Universal plans (linked to no solution) appear for every
              solution.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Linked to this solution ({linkedPlans.length})
            </div>
            {linkedPlans.length === 0 ? (
              <p className="text-xs text-slate-500">
                No solution-specific plans yet — the universal plans below apply.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {linkedPlans.map((p) => (
                  <span
                    key={p._id}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700"
                  >
                    <strong>{p.name}</strong> · {p.months}mo
                    {role === "ADMIN" && (
                      <button
                        type="button"
                        onClick={() =>
                          togglePlanLink.mutate({ plan: p, link: false })
                        }
                        className="ml-1 hover:text-brand-900"
                        title="Detach from this solution"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
          {universalPlans.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Universal plans ({universalPlans.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {universalPlans.map((p) => (
                  <span
                    key={p._id}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700"
                  >
                    {p.name} · {p.months}mo
                  </span>
                ))}
              </div>
            </div>
          )}
          {role === "ADMIN" && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Other plans (click to attach)
              </div>
              <div className="flex flex-wrap gap-2">
                {allPlans
                  .filter(
                    (p) =>
                      p.active &&
                      p.solutionIds &&
                      p.solutionIds.length > 0 &&
                      !p.solutionIds.includes(id!)
                  )
                  .map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => togglePlanLink.mutate({ plan: p, link: true })}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50"
                    >
                      <Check className="size-3" /> {p.name} · {p.months}mo
                    </button>
                  ))}
                {allPlans.filter(
                  (p) =>
                    p.active &&
                    p.solutionIds &&
                    p.solutionIds.length > 0 &&
                    !p.solutionIds.includes(id!)
                ).length === 0 && (
                  <span className="text-xs text-slate-400">
                    All restricted plans are already attached.
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Manage the full catalog under{" "}
                <Link
                  to="/admin/installment-plans"
                  className="text-brand-600 hover:underline"
                >
                  Installment plans
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Per Review 1.2 (2026-05-04): per-solution dashboard. */}
      <Card padding={false} className="mt-6">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold flex items-center gap-2">
            <FileSignature className="size-4" /> Contracts on this solution
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {role === "ADMIN" || role === "AREA_MANAGER"
              ? "Across the whole company (filtered by your visibility)."
              : "Only your own contracts."}
          </p>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat
              label="Total contracts"
              value={dash?.totals.count ?? 0}
            />
            <Stat
              label="Total amount"
              value={
                dash
                  ? formatCents(dash.totals.amountCents, "EUR")
                  : "—"
              }
            />
            <Stat
              label="Signed"
              value={
                dash?.summary.find((s) => s._id === "SIGNED")?.count ?? 0
              }
            />
            <Stat
              label="Drafts"
              value={dash?.summary.find((s) => s._id === "DRAFT")?.count ?? 0}
            />
          </div>
          {dash && dash.recent.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              No contracts on this solution yet.
            </p>
          ) : (
            <Table>
              <THead>
                <Th>Contract</Th>
                <Th>Status</Th>
                <Th>Amount</Th>
                <Th>Payment</Th>
                <Th>Signed</Th>
                <Th>Created</Th>
              </THead>
              <TBody>
                {dash?.recent.map((c) => (
                  <Tr key={c._id}>
                    <Td>
                      <Link
                        to={`/contracts/${c._id}`}
                        className="text-brand-600 hover:underline"
                      >
                        <code className="text-xs font-mono">
                          {c._id.slice(-8)}
                        </code>
                      </Link>
                    </Td>
                    <Td>
                      <StatusBadge status={c.status} />
                    </Td>
                    <Td className="font-semibold">
                      {formatCents(c.amountCents, c.currency)}
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {c.paymentMethod.replace(/_/g, " ")}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {formatDate(c.signedAt)}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {formatDateTime(c.createdAt)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-lg font-semibold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
