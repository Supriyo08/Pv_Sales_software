import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { formatCents } from "../lib/format";
import type { Customer, User, Solution, SolutionVersion } from "../lib/api-types";

export function ContractNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [customerId, setCustomerId] = useState(params.get("customerId") ?? "");
  const [agentId, setAgentId] = useState("");
  const [solutionId, setSolutionId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [amountEuro, setAmountEuro] = useState("");
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

  useEffect(() => {
    if (versions.length > 0 && !versionId) setVersionId(versions[0]!._id);
  }, [versions, versionId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const amountCents = Math.round(parseFloat(amountEuro) * 100);
      const { data } = await api.post("/contracts", {
        customerId,
        agentId,
        solutionVersionId: versionId,
        amountCents,
      });
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

  const selectedVersion = versions.find((v) => v._id === versionId);
  const amountNum = parseFloat(amountEuro);
  const previewValid = !isNaN(amountNum) && selectedVersion;

  return (
    <div>
      <BackLink to="/contracts">Back to contracts</BackLink>
      <PageHeader title="New contract" description="Drafts can be edited; signing is irreversible." />
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
                {versions.map((v) => (
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
            hint={selectedVersion ? `Version base price: ${formatCents(selectedVersion.basePriceCents, selectedVersion.currency)}` : undefined}
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
          {previewValid && (() => {
            const agentCents = Math.round(
              (amountNum * 100 * selectedVersion!.agentBp) / 10000
            );
            const managerCents = Math.round(
              (agentCents * selectedVersion!.managerBp) / 10000
            );
            return (
              <div className="rounded-lg bg-brand-50 border border-brand-200 px-4 py-3 text-sm">
                <div className="font-medium text-brand-900 mb-2">When signed, will generate:</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-brand-700">Agent commission</div>
                    <div className="font-semibold text-brand-900">
                      {formatCents(agentCents, selectedVersion!.currency)}
                    </div>
                    <div className="text-[11px] text-brand-700/80">
                      {selectedVersion!.agentBp / 100}% of contract
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-700">Manager override</div>
                    <div className="font-semibold text-brand-900">
                      {formatCents(managerCents, selectedVersion!.currency)}
                    </div>
                    <div className="text-[11px] text-brand-700/80">
                      {selectedVersion!.managerBp / 100}% of agent commission
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="submit" loading={saving}>
              Create draft
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
