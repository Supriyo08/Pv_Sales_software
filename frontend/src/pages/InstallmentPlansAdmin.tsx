import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Calendar } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatBp, formatDate } from "../lib/format";
import type { InstallmentPlan } from "../lib/api-types";

export function InstallmentPlansAdmin() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    months: "36",
    surchargePct: "0",
    description: "",
    active: true,
  });
  const [error, setError] = useState<string | null>(null);

  const { data: plans = [] } = useQuery<InstallmentPlan[]>({
    queryKey: ["installment-plans"],
    queryFn: async () => (await api.get("/catalog/installment-plans")).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post("/catalog/installment-plans", {
        name: form.name,
        months: parseInt(form.months, 10),
        surchargeBp: Math.round(parseFloat(form.surchargePct) * 100),
        description: form.description,
        active: form.active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["installment-plans"] });
      setShowForm(false);
      setForm({ name: "", months: "36", surchargePct: "0", description: "", active: true });
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (p: InstallmentPlan) =>
      api.patch(`/catalog/installment-plans/${p._id}`, { active: !p.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["installment-plans"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/catalog/installment-plans/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["installment-plans"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Installment plans"
        description="Configurable spreads (e.g. 36 / 48 / 60 months) for advance + installments and full-installment payments. Surcharge reduces the commission base on FULL_INSTALLMENTS only."
        action={
          !showForm ? (
            <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />}>
              New plan
            </Button>
          ) : null
        }
      />

      {showForm && (
        <Card>
          <h3 className="font-semibold mb-4">New installment plan</h3>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. 60 months · 5% surcharge"
                required
              />
            </Field>
            <Field label="Months" required>
              <Input
                type="number"
                min="1"
                max="240"
                value={form.months}
                onChange={(e) => setForm({ ...form, months: e.target.value })}
                required
              />
            </Field>
            <Field
              label="Surcharge %"
              hint="Reduces the commission base for FULL_INSTALLMENTS only. 0 = no penalty."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.surchargePct}
                onChange={(e) => setForm({ ...form, surchargePct: e.target.value })}
              />
            </Field>
            <Field label="Active">
              <label className="inline-flex items-center gap-2 mt-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Selectable by agents
              </label>
            </Field>
            <div className="col-span-2">
              <Field label="Description">
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => create.mutate()} loading={create.isPending}>
              Create plan
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <CardHeader title={`All plans (${plans.length})`} />
        {plans.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No installment plans yet"
            description="Create at least one to enable installment-based payments."
          />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th className="text-right">Months</Th>
              <Th className="text-right">Surcharge</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th></Th>
            </THead>
            <TBody>
              {plans.map((p) => (
                <Tr key={p._id}>
                  <Td>
                    <div className="font-medium">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-slate-500">{p.description}</div>
                    )}
                  </Td>
                  <Td className="text-right">{p.months}</Td>
                  <Td className="text-right font-mono text-xs">
                    {formatBp(p.surchargeBp)}
                  </Td>
                  <Td>
                    {p.active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDate(p.createdAt)}</Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive.mutate(p)}
                      >
                        <span className={p.active ? "text-amber-700" : "text-emerald-700"}>
                          {p.active ? "Deactivate" : "Activate"}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="size-3.5 text-red-500" />}
                        onClick={() => {
                          if (confirm(`Delete plan "${p.name}"?`)) remove.mutate(p._id);
                        }}
                      >
                        <span className="text-red-600">Delete</span>
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
