import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Calculator, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, Th, THead, Td, Tr } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents } from "../lib/format";
import type { PricingFormula, QuoteResult, Solution, SolutionVersion } from "../lib/api-types";

export function Quote() {
  const [params] = useSearchParams();
  const initialFormulaId = params.get("formulaId") ?? "";

  const [formulaId, setFormulaId] = useState(initialFormulaId);
  const [panelsKwh, setPanelsKwh] = useState("5");
  const [batteryKwh, setBatteryKwh] = useState("10");
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: formulas = [] } = useQuery<PricingFormula[]>({
    queryKey: ["pricing-formulas", "active"],
    queryFn: async () =>
      (await api.get("/pricing-formulas", { params: { active: true } })).data,
  });

  const { data: solutions = [] } = useQuery<Solution[]>({
    queryKey: ["solutions"],
    queryFn: async () => (await api.get("/catalog/solutions")).data,
  });

  // Pull versions for ALL solutions to render the side-by-side comparison.
  // Small N — dashboard already does this pattern.
  const { data: standardVersions = [] } = useQuery<SolutionVersion[]>({
    queryKey: ["solution-versions-flat", solutions.map((s) => s._id).join(",")],
    queryFn: async () => {
      const lists = await Promise.all(
        solutions.map((s) =>
          api
            .get<SolutionVersion[]>(`/catalog/solutions/${s._id}/versions`)
            .then((r) => r.data.filter((v) => v.active))
        )
      );
      return lists.flat();
    },
    enabled: solutions.length > 0,
  });

  useEffect(() => {
    if (formulas.length > 0 && !formulaId) setFormulaId(formulas[0]!._id);
  }, [formulas, formulaId]);

  const compute = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<QuoteResult>(
        `/pricing-formulas/${formulaId}/quote`,
        {
          panelsKwh: parseFloat(panelsKwh),
          batteryKwh: parseFloat(batteryKwh),
        }
      );
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed to compute quote"),
  });

  const selectedFormula = formulas.find((f) => f._id === formulaId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quote builder"
        description="Build a custom solution by entering kWh for solar panels + storage. Compare vs standard solutions side-by-side."
      />

      {formulas.length === 0 ? (
        <Card>
          <EmptyState
            icon={Calculator}
            title="No pricing formulas configured"
            description="An admin must create at least one pricing formula before agents can quote custom solutions."
          />
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="font-semibold mb-4">Custom build</h3>
            <div className="space-y-4">
              <Field label="Pricing formula" required>
                <Select
                  value={formulaId}
                  onChange={(e) => setFormulaId(e.target.value)}
                  required
                >
                  <option value="">— Select —</option>
                  {formulas.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Solar panels (kWh)" required>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={panelsKwh}
                    onChange={(e) => setPanelsKwh(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Storage battery (kWh)" required>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={batteryKwh}
                    onChange={(e) => setBatteryKwh(e.target.value)}
                    required
                  />
                </Field>
              </div>
              {selectedFormula && (
                <div className="text-xs text-slate-500">
                  Base: {formatCents(selectedFormula.panelsBasePerKwhCents)}/kWh panels +{" "}
                  {formatCents(selectedFormula.batteryBasePerKwhCents)}/kWh battery ·{" "}
                  {selectedFormula.stepRules.length} step rules
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <Button
                onClick={() => compute.mutate()}
                loading={compute.isPending}
                disabled={!formulaId}
                icon={<RefreshCw className="size-4" />}
              >
                Compute quote
              </Button>
            </div>

            {result && (
              <div className="mt-6 rounded-lg border border-brand-200 bg-brand-50 p-4">
                <div className="text-xs text-brand-700 uppercase tracking-wider mb-1">
                  Total
                </div>
                <div className="text-3xl font-bold text-brand-900">
                  {formatCents(result.totalCents, result.currency)}
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-700">
                    <span>Panels base ({result.panelsKwh} kWh)</span>
                    <span className="font-medium">{formatCents(result.panelsBaseCents)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Battery base ({result.batteryKwh} kWh)</span>
                    <span className="font-medium">{formatCents(result.batteryBaseCents)}</span>
                  </div>
                  {result.steps.length > 0 && (
                    <div className="pt-2 border-t border-brand-200/50">
                      <div className="text-xs text-brand-700 uppercase tracking-wider mb-1">
                        Step rules matched
                      </div>
                      {result.steps.map((s, i) => (
                        <div key={i} className="flex justify-between text-slate-700">
                          <span>{s.label}</span>
                          <span className="font-medium">+ {formatCents(s.addCents)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card padding={false}>
            <CardHeader
              title="Side-by-side: standard solutions"
              description="Compare your custom build against active solution versions."
            />
            {standardVersions.length === 0 ? (
              <EmptyState
                icon={Calculator}
                title="No standard solutions"
                description="No active versions to compare against."
              />
            ) : (
              <Table>
                <THead>
                  <Th>Solution</Th>
                  <Th className="text-right">Base price</Th>
                  <Th className="text-right">Δ vs custom</Th>
                </THead>
                <TBody>
                  {standardVersions.map((v) => {
                    const sol = solutions.find((s) => s._id === v.solutionId);
                    const diff = result ? v.basePriceCents - result.totalCents : null;
                    return (
                      <Tr key={v._id}>
                        <Td className="font-medium">
                          {sol?.name ?? "—"}
                          <div className="text-xs text-slate-500">
                            agent {v.agentBp / 100}% · mgr {v.managerBp / 100}%
                          </div>
                        </Td>
                        <Td className="text-right font-semibold">
                          {formatCents(v.basePriceCents, v.currency)}
                        </Td>
                        <Td className="text-right">
                          {diff === null ? (
                            <span className="text-slate-400">—</span>
                          ) : diff > 0 ? (
                            <Badge tone="amber">
                              + {formatCents(diff)} more than custom
                            </Badge>
                          ) : diff < 0 ? (
                            <Badge tone="green">
                              {formatCents(Math.abs(diff))} cheaper
                            </Badge>
                          ) : (
                            <Badge tone="neutral">equal</Badge>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
