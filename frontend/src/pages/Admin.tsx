import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trophy,
} from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { formatBp, formatCents, formatDate, currentPeriod } from "../lib/format";
import type { BonusRule, Bonus, User } from "../lib/api-types";

const ROLES = ["AGENT", "AREA_MANAGER"] as const; // ADMIN doesn't qualify for sales bonuses
const CONDITIONS = ["AGENT_INSTALLATIONS_GTE", "NETWORK_INSTALLATIONS_GTE"] as const;

// Backend constraint: only these (role, condition) combos are valid.
const ROLE_TO_CONDITION: Record<(typeof ROLES)[number], (typeof CONDITIONS)[number]> = {
  AGENT: "AGENT_INSTALLATIONS_GTE",
  AREA_MANAGER: "NETWORK_INSTALLATIONS_GTE",
};

const CONDITION_LABEL: Record<string, string> = {
  AGENT_INSTALLATIONS_GTE: "Agent's own activations ≥ threshold",
  NETWORK_INSTALLATIONS_GTE: "Network activations (manager's agents) ≥ threshold",
};

type CandidateOutcome = {
  userId: string;
  fullName: string;
  ruleName: string;
  ruleId: string;
  qualifierCount: number;
  threshold: number;
  baseAmountCents: number;
  bonusAmountCents: number;
  status: string;
  message?: string;
};

type RunSummary = {
  period: string;
  rulesEvaluated: number;
  candidatesConsidered: number;
  bonusesCreated: number;
  bonusesSkippedExisting: number;
  bonusesNotQualified: number;
  outcomes: CandidateOutcome[];
};

const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "red" | "neutral" | "blue" }> = {
  CREATED: { label: "Created", tone: "green" },
  ALREADY_EXISTED: { label: "Already exists", tone: "blue" },
  BELOW_THRESHOLD: { label: "Below threshold", tone: "amber" },
  ZERO_BASE: { label: "Zero base commission", tone: "amber" },
  NO_SIGNED_CONTRACTS: { label: "No signed contracts", tone: "neutral" },
  NO_ACTIVATIONS_IN_PERIOD: { label: "No activations in period", tone: "neutral" },
  NO_AGENTS_IN_NETWORK: { label: "No agents in network", tone: "neutral" },
  WRONG_ROLE_FOR_NETWORK: { label: "Wrong role for condition", tone: "red" },
  DUPLICATE_KEY: { label: "Duplicate (race)", tone: "red" },
};

export function Admin() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [runResult, setRunResult] = useState<RunSummary | { error: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "AGENT" as (typeof ROLES)[number],
    conditionType: "AGENT_INSTALLATIONS_GTE" as (typeof CONDITIONS)[number],
    threshold: "10",
    pct: "15",
    validFrom: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);

  // Auto-sync condition when role changes (enforces backend's valid-combo rule).
  useEffect(() => {
    setForm((f) => ({ ...f, conditionType: ROLE_TO_CONDITION[f.role] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.role]);

  const { data: rules = [] } = useQuery<BonusRule[]>({
    queryKey: ["bonus-rules"],
    queryFn: async () => (await api.get("/catalog/bonus-rules")).data,
  });

  const { data: bonusesForPeriod = [] } = useQuery<Bonus[]>({
    queryKey: ["bonuses", period],
    queryFn: async () =>
      (await api.get("/bonuses", { params: { period } })).data,
    enabled: !!period,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });
  const userById = new Map(users.map((u) => [u._id, u]));
  const ruleById = new Map(rules.map((r) => [r._id, r]));

  const createRule = useMutation({
    mutationFn: async () =>
      api.post("/catalog/bonus-rules", {
        name: form.name,
        role: form.role,
        conditionType: form.conditionType,
        threshold: parseInt(form.threshold, 10),
        basisPoints: Math.round(parseFloat(form.pct) * 100),
        validFrom: new Date(form.validFrom).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus-rules"] });
      setShowForm(false);
      setForm({ ...form, name: "" });
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const runBonus = useMutation({
    mutationFn: async () =>
      (await api.post<RunSummary>("/bonuses/run", { period })).data,
    onSuccess: (data) => {
      setRunResult(data);
      qc.invalidateQueries({ queryKey: ["bonuses"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setRunResult({ error: err?.response?.data?.error ?? "Failed" }),
  });

  const recalcBonus = useMutation({
    mutationFn: async () =>
      (await api.post<RunSummary>(`/bonuses/recalc/period/${period}`)).data,
    onSuccess: (data) => {
      setRunResult(data);
      qc.invalidateQueries({ queryKey: ["bonuses"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setRunResult({ error: err?.response?.data?.error ?? "Failed" }),
  });

  const summary = runResult && "rulesEvaluated" in runResult ? runResult : null;
  const summaryError = runResult && "error" in runResult ? runResult.error : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bonuses"
        description="Run monthly bonuses, configure rules, see who qualified and why."
      />

      <Card>
        <h3 className="font-semibold">Run bonus calculation</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          <strong>Run now</strong> is idempotent — safe to re-run for the same period.{" "}
          <strong>Recalculate</strong> wipes existing bonuses for the period and re-runs with
          current rules — use after editing a bonus rule retroactively.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period">
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="YYYY-MM"
              className="w-40"
            />
          </Field>
          <Button
            onClick={() => runBonus.mutate()}
            loading={runBonus.isPending}
            icon={<Play className="size-4" />}
          >
            Run now
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (
                confirm(
                  `Recalculate bonuses for ${period}? This supersedes existing bonus commissions for the period and re-runs with current rules.`
                )
              ) {
                recalcBonus.mutate();
              }
            }}
            loading={recalcBonus.isPending}
            icon={<RefreshCw className="size-4" />}
          >
            Recalculate period
          </Button>
        </div>

        {summaryError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {summaryError}
          </div>
        )}

        {summary && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryTile
                label="Rules evaluated"
                value={summary.rulesEvaluated}
                icon={<CheckCircle2 className="size-4 text-slate-500" />}
              />
              <SummaryTile
                label="Candidates considered"
                value={summary.candidatesConsidered}
                icon={<CheckCircle2 className="size-4 text-slate-500" />}
              />
              <SummaryTile
                label="Bonuses created"
                value={summary.bonusesCreated}
                tone="green"
                icon={<Trophy className="size-4 text-emerald-600" />}
              />
              <SummaryTile
                label="Did not qualify"
                value={summary.bonusesNotQualified}
                tone="amber"
                icon={<AlertCircle className="size-4 text-amber-600" />}
              />
            </div>

            {summary.outcomes.length === 0 ? (
              <p className="text-sm text-slate-500">
                No candidates were considered — likely no rules are active for this period or no
                users match the rule's role.
              </p>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                  <THead>
                    <Th>Candidate</Th>
                    <Th>Rule</Th>
                    <Th className="text-right">Activations</Th>
                    <Th className="text-right">Base</Th>
                    <Th className="text-right">Bonus</Th>
                    <Th>Outcome</Th>
                  </THead>
                  <TBody>
                    {summary.outcomes.map((o, idx) => {
                      const meta = STATUS_LABEL[o.status] ?? {
                        label: o.status,
                        tone: "neutral" as const,
                      };
                      return (
                        <Tr key={`${o.userId}-${o.ruleId}-${idx}`}>
                          <Td className="font-medium">{o.fullName}</Td>
                          <Td className="text-xs">{o.ruleName}</Td>
                          <Td className="text-right">
                            {o.qualifierCount}/{o.threshold}
                          </Td>
                          <Td className="text-right">{formatCents(o.baseAmountCents)}</Td>
                          <Td className="text-right font-semibold">
                            {o.bonusAmountCents > 0 ? formatCents(o.bonusAmountCents) : "—"}
                          </Td>
                          <Td>
                            <div>
                              <Badge tone={meta.tone}>{meta.label}</Badge>
                              {o.message && (
                                <div className="text-[11px] text-slate-500 mt-1">{o.message}</div>
                              )}
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card padding={false}>
        <CardHeader
          title={`Bonuses for ${period} (${bonusesForPeriod.length})`}
          description="Persisted bonus records — these match the COMMITTED rows in the bonuses collection."
        />
        {bonusesForPeriod.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No bonuses for this period yet"
            description="Run the calculation above. If it shows 'Did not qualify' for everyone, advance an installation to ACTIVATED in the period and try again."
          />
        ) : (
          <Table>
            <THead>
              <Th>Beneficiary</Th>
              <Th>Rule</Th>
              <Th className="text-right">Activations</Th>
              <Th className="text-right">Base commission</Th>
              <Th className="text-right">Bonus</Th>
              <Th>Created</Th>
            </THead>
            <TBody>
              {bonusesForPeriod.map((b) => (
                <Tr key={b._id}>
                  <Td className="font-medium">
                    {userById.get(b.userId)?.fullName ?? (
                      <code className="font-mono text-xs">{b.userId.slice(-8)}</code>
                    )}
                  </Td>
                  <Td className="text-xs">
                    {ruleById.get(b.ruleId)?.name ?? (
                      <code className="font-mono">{b.ruleId.slice(-8)}</code>
                    )}
                  </Td>
                  <Td className="text-right">{b.qualifierCount}</Td>
                  <Td className="text-right">{formatCents(b.baseAmountCents)}</Td>
                  <Td className="text-right font-semibold text-emerald-700">
                    {formatCents(b.bonusAmountCents)}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDate(b.createdAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card padding={false}>
        <CardHeader
          title="Bonus rules"
          description="Configure thresholds and percentages. Only valid (role, condition) combos are accepted."
          action={
            !showForm ? (
              <Button
                onClick={() => setShowForm(true)}
                icon={<Plus className="size-4" />}
                size="sm"
              >
                New rule
              </Button>
            ) : null
          }
        />

        {showForm && (
          <div className="bg-slate-50 border-b border-slate-200 p-6">
            <div className="grid grid-cols-2 gap-4 max-w-xl">
              <Field label="Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Role" hint="Determines who's eligible for this bonus">
                <Select
                  value={form.role}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      role: e.target.value as (typeof ROLES)[number],
                    })
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="col-span-2">
                <Field label="Condition" hint={CONDITION_LABEL[form.conditionType]}>
                  <Input value={form.conditionType} disabled className="font-mono text-xs" />
                </Field>
              </div>
              <Field
                label="Threshold (activations)"
                hint="Minimum activated installations in the period to qualify"
              >
                <Input
                  type="number"
                  min="0"
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                />
              </Field>
              <Field
                label="Bonus %"
                hint="Applied to the user's monthly commission earnings (not contract amounts)"
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.pct}
                  onChange={(e) => setForm({ ...form, pct: e.target.value })}
                />
              </Field>
              <Field label="Valid from">
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
              </Field>
            </div>
            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={() => createRule.mutate()} loading={createRule.isPending}>
                Create rule
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <EmptyState
            icon={XCircle}
            title="No rules configured"
            description="Create at least one rule to enable monthly bonuses."
          />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Condition</Th>
              <Th className="text-right">Threshold</Th>
              <Th className="text-right">Bonus</Th>
              <Th>Valid from</Th>
            </THead>
            <TBody>
              {rules.map((r) => {
                const validCombo =
                  ROLE_TO_CONDITION[r.role as (typeof ROLES)[number]] === r.conditionType;
                return (
                  <Tr key={r._id}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td>
                      <Badge tone="brand">{r.role}</Badge>
                    </Td>
                    <Td className="text-xs font-mono text-slate-600">
                      {r.conditionType}
                      {!validCombo && (
                        <Badge tone="red">
                          <AlertCircle className="size-3" /> invalid combo
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-right">{r.threshold}</Td>
                    <Td className="text-right font-semibold">{formatBp(r.basisPoints)}</Td>
                    <Td>{formatDate(r.validFrom)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  tone?: "neutral" | "green" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded-lg border ${toneClass} p-3`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-600 font-medium">{label}</div>
        {icon}
      </div>
      <div className="text-2xl font-bold mt-1 text-slate-900">{value}</div>
    </div>
  );
}
