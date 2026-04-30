import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Calculator, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents, formatDate } from "../lib/format";
import type { PricingFormula, PricingStepRule } from "../lib/api-types";

type FormState = {
  name: string;
  description: string;
  panelsBaseEuroPerKwh: string;
  batteryBaseEuroPerKwh: string;
  active: boolean;
  steps: { variable: "panels" | "battery"; thresholdKwh: string; addEuro: string; label: string }[];
};

const EMPTY: FormState = {
  name: "",
  description: "",
  panelsBaseEuroPerKwh: "2000",
  batteryBaseEuroPerKwh: "1500",
  active: true,
  steps: [],
};

export function PricingFormulasAdmin() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const { data: formulas = [] } = useQuery<PricingFormula[]>({
    queryKey: ["pricing-formulas"],
    queryFn: async () => (await api.get("/pricing-formulas")).data,
  });

  const create = useMutation({
    mutationFn: async () => {
      const stepRules: PricingStepRule[] = form.steps
        .filter((s) => s.thresholdKwh && s.addEuro)
        .map((s) => ({
          variable: s.variable,
          thresholdKwh: parseFloat(s.thresholdKwh),
          addCents: Math.round(parseFloat(s.addEuro) * 100),
          label: s.label,
        }));
      return api.post("/pricing-formulas", {
        name: form.name,
        description: form.description,
        panelsBasePerKwhCents: Math.round(parseFloat(form.panelsBaseEuroPerKwh) * 100),
        batteryBasePerKwhCents: Math.round(parseFloat(form.batteryBaseEuroPerKwh) * 100),
        stepRules,
        active: form.active,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-formulas"] });
      setShowForm(false);
      setForm(EMPTY);
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/pricing-formulas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-formulas"] }),
  });

  const addStep = () =>
    setForm({
      ...form,
      steps: [
        ...form.steps,
        { variable: "panels", thresholdKwh: "", addEuro: "", label: "" },
      ],
    });

  const updateStep = (idx: number, patch: Partial<FormState["steps"][number]>) =>
    setForm({
      ...form,
      steps: form.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });

  const removeStep = (idx: number) =>
    setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Custom pricing formulas"
        description="kWh-based pricing with non-linear step jumps. Agents use these in the Quote tool to build a custom solution side-by-side with standard solutions."
        action={
          !showForm ? (
            <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />}>
              New formula
            </Button>
          ) : null
        }
      />

      {showForm && (
        <Card>
          <h3 className="font-semibold mb-4">New pricing formula</h3>
          <div className="grid grid-cols-2 gap-4 max-w-3xl">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
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
                Selectable in Quote tool
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
            <Field label="Base €/kWh — solar panels" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.panelsBaseEuroPerKwh}
                onChange={(e) => setForm({ ...form, panelsBaseEuroPerKwh: e.target.value })}
                required
              />
            </Field>
            <Field label="Base €/kWh — storage battery" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.batteryBaseEuroPerKwh}
                onChange={(e) => setForm({ ...form, batteryBaseEuroPerKwh: e.target.value })}
                required
              />
            </Field>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">
                Step rules ({form.steps.length})
              </h4>
              <Button size="sm" variant="outline" onClick={addStep}>
                + Add step
              </Button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              When the input variable's value is <strong>strictly greater than</strong> the
              threshold, the add-amount is added to the total. Multiple steps can stack.
            </p>
            <div className="space-y-2">
              {form.steps.map((s, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-2"
                >
                  <Select
                    value={s.variable}
                    onChange={(e) =>
                      updateStep(idx, {
                        variable: e.target.value as "panels" | "battery",
                      })
                    }
                    className="col-span-2"
                  >
                    <option value="panels">panels</option>
                    <option value="battery">battery</option>
                  </Select>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="threshold (kWh)"
                      value={s.thresholdKwh}
                      onChange={(e) =>
                        updateStep(idx, { thresholdKwh: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="add (EUR)"
                      value={s.addEuro}
                      onChange={(e) => updateStep(idx, { addEuro: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      placeholder="label (optional)"
                      value={s.label}
                      onChange={(e) => updateStep(idx, { label: e.target.value })}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-3.5 text-red-500" />}
                    onClick={() => removeStep(idx)}
                  >
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              ))}
              {form.steps.length === 0 && (
                <p className="text-sm text-slate-500 italic">No step rules — pricing is purely linear.</p>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => create.mutate()} loading={create.isPending}>
              Create formula
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <CardHeader title={`All formulas (${formulas.length})`} />
        {formulas.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="No pricing formulas yet"
            description="Create one to enable custom-solution quoting for agents."
          />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th className="text-right">Panels €/kWh</Th>
              <Th className="text-right">Battery €/kWh</Th>
              <Th className="text-right">Steps</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th></Th>
            </THead>
            <TBody>
              {formulas.map((f) => (
                <Tr key={f._id}>
                  <Td>
                    <div className="font-medium">{f.name}</div>
                    {f.description && (
                      <div className="text-xs text-slate-500">{f.description}</div>
                    )}
                  </Td>
                  <Td className="text-right">{formatCents(f.panelsBasePerKwhCents)}</Td>
                  <Td className="text-right">{formatCents(f.batteryBasePerKwhCents)}</Td>
                  <Td className="text-right">{f.stepRules.length}</Td>
                  <Td>
                    {f.active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDate(f.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/quote?formulaId=${f._id}`}>Quote</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="size-3.5 text-red-500" />}
                        onClick={() => {
                          if (confirm(`Delete formula "${f.name}"?`)) remove.mutate(f._id);
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
