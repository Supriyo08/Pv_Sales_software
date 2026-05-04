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

  // Per Review 1.2 (2026-05-04): when the version has a pricingMatrix, the
  // contract form must restrict payment method + plan choices to combinations
  // that actually exist in the matrix. Empty matrix → fall back to all
  // methods/plans (legacy behaviour pre-matrix).
  const matrixRows = selectedVersion?.pricingMatrix ?? [];
  const matrixActive = matrixRows.length > 0;

  const allowedMethods = useMemo(() => {
    if (!matrixActive) return PAYMENT_METHODS.map((p) => p.value);
    const set = new Set<ContractPaymentMethod>();
    for (const r of matrixRows) set.add(r.paymentMethod);
    return PAYMENT_METHODS.map((p) => p.value).filter((m) => set.has(m));
  }, [matrixActive, matrixRows]);

  const allowedPlanIds = useMemo(() => {
    if (!matrixActive) return null; // null = no matrix filter, allow all
    const ids = new Set<string>();
    let allowsUnplanned = false;
    for (const r of matrixRows) {
      if (r.paymentMethod !== paymentMethod) continue;
      if (r.installmentPlanId) ids.add(r.installmentPlanId);
      else allowsUnplanned = true;
    }
    return { ids, allowsUnplanned };
  }, [matrixActive, matrixRows, paymentMethod]);

  const visiblePlans = useMemo(() => {
    if (!allowedPlanIds) return activePlans;
    return activePlans.filter((p) => allowedPlanIds.ids.has(p._id));
  }, [activePlans, allowedPlanIds]);

  // Snap the chosen payment method to the first one allowed by the matrix
  // whenever the version (and therefore the matrix) changes — otherwise the
  // user is stuck on a default like ONE_TIME that the version may not offer.
  useEffect(() => {
    if (allowedMethods.length === 0) return;
    if (!allowedMethods.includes(paymentMethod)) {
      setPaymentMethod(allowedMethods[0]!);
      setInstallmentPlanId("");
      setAdvanceEuro("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedMethods.join(",")]);

  // Same for the plan: clear if it's no longer valid for the chosen method.
  useEffect(() => {
    if (!allowedPlanIds) return;
    if (
      installmentPlanId &&
      !allowedPlanIds.ids.has(installmentPlanId) &&
      !allowedPlanIds.allowsUnplanned
    ) {
      setInstallmentPlanId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, allowedPlanIds]);

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
                {versions
                  .filter((v) => v.active)
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

          {matrixActive && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-900">
              This solution version has a <strong>pricing matrix</strong> configured —
              only payment methods and plans defined in the matrix are selectable.
              Final price + commission will be derived from the matching matrix row.
            </div>
          )}

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
              {PAYMENT_METHODS.filter((p) => allowedMethods.includes(p.value)).map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500 mt-1">
              {PAYMENT_METHODS.find((p) => p.value === paymentMethod)?.help}
            </p>
            {matrixActive && allowedMethods.length === 0 && (
              <p className="text-xs text-amber-700 mt-1">
                The pricing matrix on this version has no rows. Ask an admin to
                configure at least one before creating contracts.
              </p>
            )}
          </Field>

          {paymentMethod !== "ONE_TIME" && (
            <Field label="Installment plan" required>
              <Select
                value={installmentPlanId}
                onChange={(e) => setInstallmentPlanId(e.target.value)}
                required
              >
                <option value="">— Select plan —</option>
                {visiblePlans.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} · {p.months} months ·{" "}
                    {p.surchargeBp > 0 ? `${p.surchargeBp / 100}% surcharge` : "no surcharge"}
                  </option>
                ))}
              </Select>
              {matrixActive && visiblePlans.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  No installment plans are linked to this payment method in the
                  pricing matrix.
                </p>
              )}
            </Field>
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
