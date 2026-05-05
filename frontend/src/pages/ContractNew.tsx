import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { formatCents } from "../lib/format";
import type {
  Customer,
  User,
  Solution,
  SolutionVersion,
  InstallmentPlan,
  ContractPaymentMethod,
  SolutionPricingMatrixRow,
} from "../lib/api-types";

const PAYMENT_METHODS: { value: ContractPaymentMethod; label: string; help: string }[] = [
  {
    value: "ONE_TIME",
    label: "One-time payment",
    help: "Paid in full upfront. Commission base = full contract amount.",
  },
  {
    value: "ADVANCE_INSTALLMENTS",
    label: "Advance + installments",
    help: "Customer pays an advance, then monthly instalments. Commission base = full amount.",
  },
  {
    value: "FULL_INSTALLMENTS",
    label: "Full installments",
    help: "All paid in equal monthly instalments. Commission base reduced by the plan's surcharge%.",
  },
];

export function ContractNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [customerId, setCustomerId] = useState(params.get("customerId") ?? "");
  const [agentId, setAgentId] = useState("");
  const [solutionId, setSolutionId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [amountEuro, setAmountEuro] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<ContractPaymentMethod>("ONE_TIME");
  const [advanceEuro, setAdvanceEuro] = useState("");
  const [installmentPlanId, setInstallmentPlanId] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", ""],
    queryFn: async () => (await api.get("/customers")).data,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });
  const agents = users.filter((u) => u.role === "AGENT");

  const { data: solutions = [] } = useQuery<Solution[]>({
    queryKey: ["solutions"],
    queryFn: async () => (await api.get("/catalog/solutions")).data,
  });

  const { data: versions = [] } = useQuery<SolutionVersion[]>({
    queryKey: ["solution-versions", solutionId],
    queryFn: async () =>
      (await api.get(`/catalog/solutions/${solutionId}/versions`)).data,
    enabled: !!solutionId,
  });

  // Per Review 1.1 §4: filter by selected solution. Backend returns plans whose
  // solutionIds include the chosen solution OR have empty solutionIds (= all).
  const { data: plans = [] } = useQuery<InstallmentPlan[]>({
    queryKey: ["installment-plans", "active", { solutionId }],
    queryFn: async () =>
      (
        await api.get("/catalog/installment-plans", {
          params: {
            active: "true",
            solutionId: solutionId || undefined,
          },
        })
      ).data,
    enabled: true,
  });
  const activePlans = plans.filter((p) => p.active);

  useEffect(() => {
    if (versions.length > 0 && !versionId) setVersionId(versions[0]!._id);
  }, [versions, versionId]);

  const selectedVersion = versions.find((v) => v._id === versionId);
  const selectedPlan = activePlans.find((p) => p._id === installmentPlanId);

  // Per Review 1.2 (2026-05-04): pricing matrix on the version drives EVERY
  // pricing choice. Each matrix row is a pre-priced "tier" that the agent
  // picks — the row's label, plan, price, advance window, and commissions
  // auto-fill the form. Empty matrix → fall back to the legacy free-form
  // payment-method + plan dropdowns.
  const matrixRows = (selectedVersion?.pricingMatrix ?? []) as SolutionPricingMatrixRow[];
  const matrixActive = matrixRows.length > 0;

  // Stable id for a row even when the user hasn't saved (so React keys + state
  // stay consistent across re-renders). Prefer the Mongo `_id` when present.
  const rowKey = (r: SolutionPricingMatrixRow, idx: number): string =>
    r._id ?? `row-${idx}`;

  // The user's currently selected matrix row.
  const [selectedTierKey, setSelectedTierKey] = useState<string>("");
  const selectedTier = useMemo(
    () =>
      matrixActive
        ? matrixRows.find((r, i) => rowKey(r, i) === selectedTierKey)
        : undefined,
    [matrixActive, matrixRows, selectedTierKey]
  );

  // Build a human label for a row when the admin didn't set one explicitly.
  const planNameById = useMemo(
    () => new Map(activePlans.map((p) => [p._id, `${p.name} · ${p.months}mo`])),
    [activePlans]
  );
  const tierLabel = (r: SolutionPricingMatrixRow): string => {
    if (r.label && r.label.trim()) return r.label.trim();
    const parts: string[] = [];
    parts.push(
      r.paymentMethod === "ONE_TIME"
        ? "One-time"
        : r.paymentMethod === "ADVANCE_INSTALLMENTS"
          ? "Advance + installments"
          : "Full installments"
    );
    if (r.installmentPlanId) {
      parts.push(planNameById.get(r.installmentPlanId) ?? "plan");
    }
    if (r.advanceMinCents !== null && r.advanceMinCents !== undefined) {
      const min = formatCents(r.advanceMinCents, "EUR");
      const max =
        r.advanceMaxCents !== null && r.advanceMaxCents !== undefined
          ? formatCents(r.advanceMaxCents, "EUR")
          : "no max";
      parts.push(`advance ${min}–${max}`);
    }
    if (r.finalPriceCents) {
      parts.push(`${formatCents(r.finalPriceCents, "EUR")}`);
    }
    return parts.join(" · ");
  };

  // When the version (and therefore its matrix) changes, default-select the
  // first row so the form is immediately fillable.
  useEffect(() => {
    if (!matrixActive) {
      setSelectedTierKey("");
      return;
    }
    const firstKey = rowKey(matrixRows[0]!, 0);
    if (
      !selectedTierKey ||
      !matrixRows.some((r, i) => rowKey(r, i) === selectedTierKey)
    ) {
      setSelectedTierKey(firstKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, matrixActive, matrixRows.length]);

  // Apply a tier's values to the form (paymentMethod, plan, price, advance).
  // We only overwrite empty fields when the user is mid-entry — but on the
  // FIRST application for a given tier we always sync, otherwise the matrix
  // wouldn't actually be in effect.
  useEffect(() => {
    if (!selectedTier) return;
    setPaymentMethod(selectedTier.paymentMethod);
    setInstallmentPlanId(selectedTier.installmentPlanId ?? "");
    if (selectedTier.finalPriceCents != null) {
      setAmountEuro((selectedTier.finalPriceCents / 100).toFixed(2));
    } else if (
      selectedTier.finalPricePct != null &&
      selectedVersion?.basePriceCents
    ) {
      const cents = Math.round(
        (selectedVersion.basePriceCents * selectedTier.finalPricePct) / 100
      );
      setAmountEuro((cents / 100).toFixed(2));
    }
    if (
      selectedTier.paymentMethod === "ADVANCE_INSTALLMENTS" &&
      selectedTier.advanceMinCents != null
    ) {
      setAdvanceEuro((selectedTier.advanceMinCents / 100).toFixed(2));
    } else if (selectedTier.paymentMethod !== "ADVANCE_INSTALLMENTS") {
      setAdvanceEuro("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTierKey]);

  const amountNum = parseFloat(amountEuro);
  const amountCents = isNaN(amountNum) ? 0 : Math.round(amountNum * 100);
  const advanceCents = Math.round(parseFloat(advanceEuro || "0") * 100);

  const outOfRange = useMemo(() => {
    if (!selectedVersion || isNaN(amountNum)) return null;
    if (
      selectedVersion.minPriceCents !== null &&
      amountCents < selectedVersion.minPriceCents
    ) {
      return "below";
    }
    if (
      selectedVersion.maxPriceCents !== null &&
      amountCents > selectedVersion.maxPriceCents
    ) {
      return "above";
    }
    return null;
  }, [selectedVersion, amountNum, amountCents]);

  const effectiveBaseCents = useMemo(() => {
    if (!selectedVersion || isNaN(amountNum)) return 0;
    if (paymentMethod === "FULL_INSTALLMENTS" && selectedPlan) {
      const reduction = Math.round((amountCents * selectedPlan.surchargeBp) / 10000);
      return Math.max(0, amountCents - reduction);
    }
    return amountCents;
  }, [paymentMethod, selectedPlan, selectedVersion, amountNum, amountCents]);

  const previewAgentCents = selectedVersion
    ? Math.round((effectiveBaseCents * selectedVersion.agentBp) / 10000)
    : 0;
  const previewManagerCents = selectedVersion
    ? Math.round((previewAgentCents * selectedVersion.managerBp) / 10000)
    : 0;

  const monthlyCents = useMemo(() => {
    if (!selectedPlan) return 0;
    if (paymentMethod === "ADVANCE_INSTALLMENTS") {
      return Math.round((amountCents - advanceCents) / selectedPlan.months);
    }
    if (paymentMethod === "FULL_INSTALLMENTS") {
      return Math.round(amountCents / selectedPlan.months);
    }
    return 0;
  }, [paymentMethod, selectedPlan, amountCents, advanceCents]);

  const requestApproval = useMutation({
    mutationFn: async () =>
      api.post("/price-approvals", {
        customerId,
        agentId,
        solutionVersionId: versionId,
        requestedAmountCents: amountCents,
        note: approvalNote,
      }),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (outOfRange) {
        // Send price-approval request instead of creating the contract directly.
        await requestApproval.mutateAsync();
        navigate("/admin/price-approvals");
        return;
      }
      const body: Record<string, unknown> = {
        customerId,
        agentId,
        solutionVersionId: versionId,
        amountCents,
        paymentMethod,
      };
      if (paymentMethod !== "ONE_TIME") {
        body.installmentPlanId = installmentPlanId;
      }
      if (paymentMethod === "ADVANCE_INSTALLMENTS") {
        body.advanceCents = advanceCents;
      }
      const { data } = await api.post("/contracts", body);
      navigate(`/contracts/${data._id}`);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Failed to create contract"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <BackLink to="/contracts">Back to contracts</BackLink>
      <PageHeader
        title="New contract"
        description="Pick a solution version + payment method. Out-of-range prices require admin approval."
      />
      <Card className="max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Customer" required>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">— Select —</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.fullName} ({c.fiscalCode})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agent" required>
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
              <option value="">— Select —</option>
              {agents.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName} ({u.email})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Solution" required>
            <Select
              value={solutionId}
              onChange={(e) => {
                setSolutionId(e.target.value);
                setVersionId("");
              }}
              required
            >
              <option value="">— Select —</option>
              {solutions.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {solutionId && (
            <Field label="Solution version" required>
              <Select value={versionId} onChange={(e) => setVersionId(e.target.value)} required>
                {/* Per Review 1.3: hide expired versions (validTo in the past)
                    and not-yet-effective versions (validFrom in the future) so
                    agents can never pick a closed pricing window by mistake. */}
                {versions
                  .filter((v) => {
                    if (!v.active) return false;
                    const now = Date.now();
                    if (new Date(v.validFrom).getTime() > now) return false;
                    if (v.validTo && new Date(v.validTo).getTime() <= now) return false;
                    return true;
                  })
                  .map((v) => (
                    <option key={v._id} value={v._id}>
                      {new Date(v.validFrom).toISOString().slice(0, 10)} ·{" "}
                      {formatCents(v.basePriceCents, v.currency)} (agent {v.agentBp / 100}%, mgr{" "}
                      {v.managerBp / 100}%)
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field
            label="Contract amount (EUR)"
            required
            hint={
              selectedVersion
                ? `Allowed range: ${
                    selectedVersion.minPriceCents !== null
                      ? formatCents(selectedVersion.minPriceCents, selectedVersion.currency)
                      : "—"
                  } → ${
                    selectedVersion.maxPriceCents !== null
                      ? formatCents(selectedVersion.maxPriceCents, selectedVersion.currency)
                      : "—"
                  } · base ${formatCents(selectedVersion.basePriceCents, selectedVersion.currency)}`
                : undefined
            }
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amountEuro}
              onChange={(e) => setAmountEuro(e.target.value)}
              required
            />
          </Field>

          {outOfRange && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <div className="flex items-start gap-3">
                <ShieldAlert className="size-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-amber-900 mb-1">
                    Amount is {outOfRange === "below" ? "below the minimum" : "above the maximum"}.
                  </div>
                  <p className="text-amber-800 text-xs mb-2">
                    Submitting will create a <strong>price approval request</strong> instead of the
                    contract. An admin or area manager must approve before the contract is signed.
                  </p>
                  <Field label="Note for the approver">
                    <Input
                      value={approvalNote}
                      onChange={(e) => setApprovalNote(e.target.value)}
                      placeholder="Why this price?"
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {matrixActive ? (
            <>
              <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900">
                This solution version has a <strong>pricing matrix</strong>{" "}
                configured. Pick one of the pre-priced tiers below — payment
                method, plan, price and advance window are filled in for you.
              </div>

              <Field label="Pricing tier" required>
                <Select
                  value={selectedTierKey}
                  onChange={(e) => setSelectedTierKey(e.target.value)}
                  required
                >
                  <option value="">— Select tier —</option>
                  {matrixRows.map((r, i) => (
                    <option key={rowKey(r, i)} value={rowKey(r, i)}>
                      {tierLabel(r)}
                    </option>
                  ))}
                </Select>
                {selectedTier && (
                  <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700 space-y-0.5">
                    <div>
                      <strong className="text-slate-900">Payment method:</strong>{" "}
                      {PAYMENT_METHODS.find((p) => p.value === selectedTier.paymentMethod)?.label}
                    </div>
                    {selectedTier.installmentPlanId && (
                      <div>
                        <strong className="text-slate-900">Plan:</strong>{" "}
                        {planNameById.get(selectedTier.installmentPlanId) ?? "—"}
                      </div>
                    )}
                    {selectedTier.finalPriceCents != null && (
                      <div>
                        <strong className="text-slate-900">Final price:</strong>{" "}
                        {formatCents(selectedTier.finalPriceCents, "EUR")}
                      </div>
                    )}
                    {selectedTier.advanceMinCents != null && (
                      <div>
                        <strong className="text-slate-900">Advance window:</strong>{" "}
                        {formatCents(selectedTier.advanceMinCents, "EUR")}
                        {" → "}
                        {selectedTier.advanceMaxCents != null
                          ? formatCents(selectedTier.advanceMaxCents, "EUR")
                          : "no max"}
                      </div>
                    )}
                    {(selectedTier.agentBp != null ||
                      selectedTier.managerBp != null) && (
                      <div>
                        <strong className="text-slate-900">Commissions:</strong>{" "}
                        agent {(selectedTier.agentBp ?? selectedVersion?.agentBp ?? 0) / 100}%
                        {" · "}
                        manager {(selectedTier.managerBp ?? selectedVersion?.managerBp ?? 0) / 100}%
                      </div>
                    )}
                  </div>
                )}
              </Field>
            </>
          ) : (
            <>
              <Field label="Payment method" required>
                <Select
                  value={paymentMethod}
                  onChange={(e) => {
                    const m = e.target.value as ContractPaymentMethod;
                    setPaymentMethod(m);
                    if (m === "ONE_TIME") {
                      setInstallmentPlanId("");
                      setAdvanceEuro("");
                    }
                    if (m === "FULL_INSTALLMENTS") setAdvanceEuro("");
                  }}
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  {PAYMENT_METHODS.find((p) => p.value === paymentMethod)?.help}
                </p>
              </Field>

              {paymentMethod !== "ONE_TIME" && (
                <Field label="Installment plan" required>
                  <Select
                    value={installmentPlanId}
                    onChange={(e) => setInstallmentPlanId(e.target.value)}
                    required
                  >
                    <option value="">— Select plan —</option>
                    {activePlans.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} · {p.months} months ·{" "}
                        {p.surchargeBp > 0
                          ? `${p.surchargeBp / 100}% surcharge`
                          : "no surcharge"}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </>
          )}

          {paymentMethod === "ADVANCE_INSTALLMENTS" && (
            <Field
              label="Advance (EUR)"
              required
              hint={
                selectedPlan && (selectedPlan.advanceMinCents !== null || selectedPlan.advanceMaxCents !== null)
                  ? `Plan range: ${selectedPlan.advanceMinCents !== null ? formatCents(selectedPlan.advanceMinCents, "EUR") : "no min"} → ${selectedPlan.advanceMaxCents !== null ? formatCents(selectedPlan.advanceMaxCents, "EUR") : "no max"}`
                  : "Paid upfront; remaining is split monthly."
              }
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                value={advanceEuro}
                onChange={(e) => setAdvanceEuro(e.target.value)}
                required
              />
              {selectedPlan && advanceEuro && (() => {
                const v = Math.round(parseFloat(advanceEuro) * 100);
                const tooLow =
                  selectedPlan.advanceMinCents !== null && v < selectedPlan.advanceMinCents;
                const tooHigh =
                  selectedPlan.advanceMaxCents !== null && v > selectedPlan.advanceMaxCents;
                return tooLow || tooHigh ? (
                  <p className="mt-1 text-xs text-red-600">
                    Advance is{" "}
                    {tooLow
                      ? `below the plan's min ${formatCents(selectedPlan.advanceMinCents!, "EUR")}`
                      : `above the plan's max ${formatCents(selectedPlan.advanceMaxCents!, "EUR")}`}
                    .
                  </p>
                ) : null;
              })()}
            </Field>
          )}

          {selectedVersion && !isNaN(amountNum) && !outOfRange && (
            <div className="rounded-lg bg-brand-50 border border-brand-200 px-4 py-3 text-sm space-y-2">
              <div className="font-medium text-brand-900">When signed, will generate:</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-brand-700">Agent commission</div>
                  <div className="font-semibold text-brand-900">
                    {formatCents(previewAgentCents, selectedVersion.currency)}
                  </div>
                  <div className="text-[11px] text-brand-700/80">
                    {selectedVersion.agentBp / 100}% of effective base
                  </div>
                </div>
                <div>
                  <div className="text-xs text-brand-700">Manager override</div>
                  <div className="font-semibold text-brand-900">
                    {formatCents(previewManagerCents, selectedVersion.currency)}
                  </div>
                  <div className="text-[11px] text-brand-700/80">
                    {selectedVersion.managerBp / 100}% of agent commission
                  </div>
                </div>
              </div>
              {paymentMethod === "FULL_INSTALLMENTS" && selectedPlan && (
                <div className="text-xs text-brand-700/90 pt-2 border-t border-brand-100">
                  Effective base = {formatCents(amountCents, selectedVersion.currency)} −{" "}
                  {selectedPlan.surchargeBp / 100}% surcharge ={" "}
                  <strong>{formatCents(effectiveBaseCents, selectedVersion.currency)}</strong>
                </div>
              )}
              {selectedPlan && monthlyCents > 0 && (
                <div className="text-xs text-brand-700/90 pt-2 border-t border-brand-100">
                  Monthly instalment ({selectedPlan.months} months):{" "}
                  <strong>{formatCents(monthlyCents, selectedVersion.currency)}</strong>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge tone="brand">{paymentMethod}</Badge>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="submit" loading={saving}>
              {outOfRange ? "Request price approval" : "Create draft"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/contracts")}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
