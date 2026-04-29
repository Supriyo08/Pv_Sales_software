import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Play } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { formatBp, formatDate, currentPeriod } from "../lib/format";
import type { BonusRule } from "../lib/api-types";

const ROLES = ["ADMIN", "AREA_MANAGER", "AGENT"] as const;
const CONDITIONS = ["AGENT_INSTALLATIONS_GTE", "NETWORK_INSTALLATIONS_GTE"] as const;

export function Admin() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [runResult, setRunResult] = useState<unknown>(null);
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

  const { data: rules = [] } = useQuery<BonusRule[]>({
    queryKey: ["bonus-rules"],
    queryFn: async () => (await api.get("/catalog/bonus-rules")).data,
  });

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
    mutationFn: async () => (await api.post("/bonuses/run", { period })).data,
    onSuccess: (data) => setRunResult(data),
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setRunResult({ error: err?.response?.data?.error ?? "Failed" }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Bonuses" description="Run monthly bonuses and configure the rules." />

      <Card>
        <h3 className="font-semibold">Run bonus calculation</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Idempotent — re-running for the same period is safe (no duplicate bonuses or commissions).
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
          <Button onClick={() => runBonus.mutate()} loading={runBonus.isPending} icon={<Play className="size-4" />}>
            Run now
          </Button>
        </div>
        {runResult !== null && (
          <pre className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs overflow-x-auto">
            {JSON.stringify(runResult, null, 2)}
          </pre>
        )}
      </Card>

      <Card padding={false}>
        <CardHeader
          title="Bonus rules"
          description="Configure the thresholds and percentages for monthly bonuses."
          action={
            !showForm ? (
              <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />} size="sm">
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
              <Field label="Role">
                <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as never })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Condition">
                <Select
                  value={form.conditionType}
                  onChange={(e) => setForm({ ...form, conditionType: e.target.value as never })}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Threshold (installations)">
                <Input
                  type="number"
                  min="0"
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                />
              </Field>
              <Field label="Bonus %">
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
            {rules.length === 0 && (
              <Tr>
                <Td colSpan={6}>
                  <span className="text-slate-500">No rules yet — create one to enable monthly bonuses.</span>
                </Td>
              </Tr>
            )}
            {rules.map((r) => (
              <Tr key={r._id}>
                <Td className="font-medium">{r.name}</Td>
                <Td>
                  <Badge tone="brand">{r.role}</Badge>
                </Td>
                <Td className="text-xs font-mono text-slate-600">{r.conditionType}</Td>
                <Td className="text-right">{r.threshold}</Td>
                <Td className="text-right font-semibold">{formatBp(r.basisPoints)}</Td>
                <Td>{formatDate(r.validFrom)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
