import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, X, Calendar, Search } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { Modal } from "../components/ui/Modal";
import { formatCents, formatDate, formatDateTime, currentPeriod } from "../lib/format";

type AgentRow = { userId: string; fullName: string; email: string; totalCents: number; count: number };
type NetworkRow = {
  managerId: string;
  fullName: string;
  email: string;
  agentCount: number;
  contractCount: number;
  contractAmountCents: number;
  activatedInstallations: number;
};
type Funnel = Record<string, { count: number; totalCents: number }>;
type PaymentSummary = Record<string, { count: number; totalCents: number }>;

export function Reports() {
  // Per Review 1.2 (2026-05-04): multi-period filter (default: all history) +
  // single optional period for back-compat. `periods` always wins when set.
  const [period, setPeriod] = useState("");
  const [periods, setPeriods] = useState<string[]>([]);
  // Drill-down state: when set, opens a modal with the underlying detail rows.
  const [drillAgent, setDrillAgent] = useState<AgentRow | null>(null);
  const [drillManager, setDrillManager] = useState<NetworkRow | null>(null);

  const filterParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (periods.length > 0) p.periods = periods.join(",");
    else if (period) p.period = period;
    return p;
  }, [period, periods]);

  const { data: agents = [] } = useQuery<AgentRow[]>({
    queryKey: ["report", "agent-earnings", filterParams],
    queryFn: async () =>
      (await api.get("/reports/agent-earnings", { params: filterParams })).data,
  });

  const { data: network = [] } = useQuery<NetworkRow[]>({
    queryKey: ["report", "network"],
    queryFn: async () => (await api.get("/reports/network-performance")).data,
  });

  const { data: funnel = {} } = useQuery<Funnel>({
    queryKey: ["report", "funnel"],
    queryFn: async () => (await api.get("/reports/pipeline-funnel")).data,
  });

  const { data: payments = {} } = useQuery<PaymentSummary>({
    queryKey: ["report", "payments"],
    queryFn: async () => (await api.get("/reports/payment-summary")).data,
  });

  const downloadCsv = async (path: string, filename: string) => {
    const res = await api.get(path, {
      params: { format: "csv", ...(period ? { period } : {}) },
      responseType: "blob",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(res.data);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Aggregated views across the sales pipeline." />

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <Field
            label="Period (YYYY-MM)"
            hint="Quick single-period filter (back-compat)."
          >
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder={currentPeriod()}
              className="w-40"
              disabled={periods.length > 0}
            />
          </Field>
          <Field
            label="Multiple periods (advanced)"
            hint="Comma-separated YYYY-MM list — overrides the single-period filter."
          >
            <PeriodChips
              periods={periods}
              setPeriods={setPeriods}
              suggestRecent={6}
            />
          </Field>
          {(period || periods.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPeriod("");
                setPeriods([]);
              }}
              icon={<X className="size-3.5" />}
            >
              Clear all
            </Button>
          )}
        </div>
        {periods.length === 0 && !period && (
          <p className="text-xs text-slate-500 mt-2">
            No filter set — showing the full history across every period.
          </p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding={false}>
          <CardHeader title="Pipeline funnel" description="Contracts grouped by status" />
          <Table>
            <TBody>
              {Object.entries(funnel).length === 0 && (
                <Tr>
                  <Td colSpan={3}>
                    <span className="text-slate-500">No data yet.</span>
                  </Td>
                </Tr>
              )}
              {Object.entries(funnel).map(([s, v]) => (
                <Tr key={s}>
                  <Td>
                    <StatusBadge status={s} />
                  </Td>
                  <Td className="text-slate-600">{v.count} contracts</Td>
                  <Td className="font-medium">{formatCents(v.totalCents)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card padding={false}>
          <CardHeader title="Payments" description="Status breakdown" />
          <Table>
            <TBody>
              {Object.entries(payments).length === 0 && (
                <Tr>
                  <Td colSpan={3}>
                    <span className="text-slate-500">No payments yet.</span>
                  </Td>
                </Tr>
              )}
              {Object.entries(payments).map(([s, v]) => (
                <Tr key={s}>
                  <Td>
                    <StatusBadge status={s} />
                  </Td>
                  <Td className="text-slate-600">{v.count} payments</Td>
                  <Td className="font-medium">{formatCents(v.totalCents)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card padding={false}>
        <CardHeader
          title={`Agent earnings${period ? " · " + period : ""}`}
          description="Active commissions summed per agent"
          action={
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="size-3.5" />}
              onClick={() => downloadCsv("/reports/agent-earnings", `agent-earnings${period ? "-" + period : ""}.csv`)}
            >
              Export CSV
            </Button>
          }
        />
        <Table>
          <THead>
            <Th>Agent</Th>
            <Th>Email</Th>
            <Th className="text-right">Commissions</Th>
            <Th className="text-right">Total</Th>
          </THead>
          <TBody>
            {agents.length === 0 && (
              <Tr>
                <Td colSpan={4}>
                  <span className="text-slate-500">No commissions yet.</span>
                </Td>
              </Tr>
            )}
            {agents.map((a) => (
              <Tr key={a.userId} onClick={() => setDrillAgent(a)}>
                <Td className="font-medium text-brand-600 hover:underline">
                  <Search className="size-3 inline mr-1" />
                  {a.fullName ?? "—"}
                </Td>
                <Td className="text-slate-600">{a.email}</Td>
                <Td className="text-right">{a.count}</Td>
                <Td className="text-right font-semibold">{formatCents(a.totalCents)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card padding={false}>
        <CardHeader
          title="Network performance"
          description="Per area manager — agents, contracts, activations"
          action={
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="size-3.5" />}
              onClick={() => downloadCsv("/reports/network-performance", "network-performance.csv")}
            >
              Export CSV
            </Button>
          }
        />
        <Table>
          <THead>
            <Th>Area Manager</Th>
            <Th className="text-right">Agents</Th>
            <Th className="text-right">Contracts</Th>
            <Th className="text-right">Activated</Th>
            <Th className="text-right">Contract value</Th>
          </THead>
          <TBody>
            {network.length === 0 && (
              <Tr>
                <Td colSpan={5}>
                  <span className="text-slate-500">No data yet.</span>
                </Td>
              </Tr>
            )}
            {network.map((n) => (
              <Tr key={n.managerId} onClick={() => setDrillManager(n)}>
                <Td className="font-medium text-brand-600 hover:underline">
                  <Search className="size-3 inline mr-1" />
                  {n.fullName}
                </Td>
                <Td className="text-right">{n.agentCount}</Td>
                <Td className="text-right">{n.contractCount}</Td>
                <Td className="text-right">{n.activatedInstallations}</Td>
                <Td className="text-right font-semibold">{formatCents(n.contractAmountCents)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* Per Review 1.2 (2026-05-04): drill-down detail modals. */}
      <AgentDrillDown
        agent={drillAgent}
        periods={periods.length > 0 ? periods : period ? [period] : []}
        onClose={() => setDrillAgent(null)}
      />
      <NetworkDrillDown
        manager={drillManager}
        periods={periods.length > 0 ? periods : period ? [period] : []}
        onClose={() => setDrillManager(null)}
      />
    </div>
  );
}

// ── Period chips (multi-select) ───────────────────────────────────────────

function PeriodChips({
  periods,
  setPeriods,
  suggestRecent = 6,
}: {
  periods: string[];
  setPeriods: (next: string[]) => void;
  suggestRecent?: number;
}) {
  const [draft, setDraft] = useState("");
  const recent = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < suggestRecent; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, [suggestRecent]);

  const toggle = (p: string) => {
    setPeriods(
      periods.includes(p) ? periods.filter((x) => x !== p) : [...periods, p]
    );
  };

  const addDraft = () => {
    const v = draft.trim();
    if (!/^\d{4}-\d{2}$/.test(v)) return;
    if (!periods.includes(v)) setPeriods([...periods, v]);
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {periods.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-brand-50 border border-brand-300 text-brand-700"
          >
            <Calendar className="size-3" /> {p}
            <button
              type="button"
              onClick={() => toggle(p)}
              className="hover:text-brand-900"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {periods.length === 0 && (
          <span className="text-xs text-slate-400">— full history —</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addDraft()}
          placeholder="YYYY-MM"
          className="w-32 text-xs"
        />
        <Button size="sm" variant="outline" onClick={addDraft}>
          + Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="text-[11px] text-slate-500 mr-1">Recent:</span>
        {recent.map((p) => {
          const on = periods.includes(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              className={`text-[11px] px-1.5 py-0.5 rounded border transition ${
                on
                  ? "bg-brand-50 border-brand-300 text-brand-700"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Agent earnings drill-down ─────────────────────────────────────────────

type AgentDetailRow = {
  _id: string;
  contractId: string | null;
  contract: {
    customerId?: string;
    amountCents?: number;
    currency?: string;
    status?: string;
    signedAt?: string | null;
  } | null;
  role: string;
  sourceEvent: string;
  amountCents: number;
  currency: string;
  period: string | null;
  generatedAt: string;
  reason?: string;
};

function AgentDrillDown({
  agent,
  periods,
  onClose,
}: {
  agent: AgentRow | null;
  periods: string[];
  onClose: () => void;
}) {
  const { data: rows = [], isLoading } = useQuery<AgentDetailRow[]>({
    queryKey: ["report", "agent-detail", agent?.userId, periods.join(",")],
    queryFn: async () =>
      (
        await api.get(`/reports/agent-earnings/${agent!.userId}`, {
          params: periods.length > 0 ? { periods: periods.join(",") } : {},
        })
      ).data,
    enabled: !!agent,
  });

  return (
    <Modal
      open={!!agent}
      onOpenChange={(o) => !o && onClose()}
      title={agent ? `Agent earnings — ${agent.fullName ?? agent.email}` : ""}
      description={
        periods.length > 0
          ? `Filtered to ${periods.join(", ")}. Click a contract to open it.`
          : "Full history across every period. Click a contract to open it."
      }
      size="xl"
    >
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No commission rows for this agent in the selected periods.
        </p>
      ) : (
        <Table>
          <THead>
            <Th>Generated</Th>
            <Th>Source event</Th>
            <Th>Period</Th>
            <Th>Contract</Th>
            <Th className="text-right">Amount</Th>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r._id}>
                <Td className="text-xs text-slate-500 whitespace-nowrap">
                  {formatDateTime(r.generatedAt)}
                </Td>
                <Td>
                  <Badge tone="brand">{r.sourceEvent}</Badge>
                </Td>
                <Td className="text-xs">{r.period ?? "—"}</Td>
                <Td>
                  {r.contractId ? (
                    <Link
                      to={`/contracts/${r.contractId}`}
                      className="text-brand-600 hover:underline"
                    >
                      <code className="text-xs font-mono">
                        {r.contractId.slice(-8)}
                      </code>
                    </Link>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </Td>
                <Td className="text-right font-semibold whitespace-nowrap">
                  {formatCents(r.amountCents, r.currency)}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </Modal>
  );
}

// ── Network performance drill-down ────────────────────────────────────────

type NetworkDetail = {
  agents: { userId: string; fullName: string; email: string }[];
  contracts: {
    _id: string;
    agentId: string;
    customerId: string;
    amountCents: number;
    currency: string;
    status: string;
    signedAt: string | null;
    paymentMethod: string;
  }[];
};

function NetworkDrillDown({
  manager,
  periods,
  onClose,
}: {
  manager: NetworkRow | null;
  periods: string[];
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<NetworkDetail>({
    queryKey: ["report", "network-detail", manager?.managerId, periods.join(",")],
    queryFn: async () =>
      (
        await api.get(`/reports/network-performance/${manager!.managerId}`, {
          params: periods.length > 0 ? { periods: periods.join(",") } : {},
        })
      ).data,
    enabled: !!manager,
  });

  const agentMap = new Map((data?.agents ?? []).map((a) => [a.userId, a]));

  return (
    <Modal
      open={!!manager}
      onOpenChange={(o) => !o && onClose()}
      title={manager ? `Network — ${manager.fullName}` : ""}
      description={`Agents in this network and their signed contracts.${periods.length > 0 ? ` Filtered to ${periods.join(", ")}.` : ""}`}
      size="xl"
    >
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Agents ({data?.agents.length ?? 0})
            </div>
            {data && data.agents.length === 0 ? (
              <p className="text-sm text-slate-500">No agents in this network.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data?.agents.map((a) => (
                  <Badge key={a.userId} tone="brand">
                    {a.fullName} <span className="opacity-70">· {a.email}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Signed contracts ({data?.contracts.length ?? 0})
            </div>
            {data && data.contracts.length === 0 ? (
              <p className="text-sm text-slate-500">No contracts in this period.</p>
            ) : (
              <Table>
                <THead>
                  <Th>Contract</Th>
                  <Th>Agent</Th>
                  <Th>Status</Th>
                  <Th>Payment</Th>
                  <Th>Signed</Th>
                  <Th className="text-right">Amount</Th>
                </THead>
                <TBody>
                  {data?.contracts.map((c) => (
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
                      <Td className="text-xs text-slate-600">
                        {agentMap.get(c.agentId)?.fullName ?? c.agentId.slice(-6)}
                      </Td>
                      <Td>
                        <StatusBadge status={c.status} />
                      </Td>
                      <Td className="text-xs">
                        {c.paymentMethod.replace(/_/g, " ")}
                      </Td>
                      <Td className="text-xs text-slate-500">
                        {formatDate(c.signedAt)}
                      </Td>
                      <Td className="text-right font-semibold">
                        {formatCents(c.amountCents, c.currency)}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
