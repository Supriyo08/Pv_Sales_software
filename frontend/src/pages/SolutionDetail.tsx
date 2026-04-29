import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { formatCents, formatDate, formatBp } from "../lib/format";
import { useRole } from "../store/auth";
import type { Solution, SolutionVersion } from "../lib/api-types";

export function SolutionDetail() {
  const { id } = useParams<{ id: string }>();
  const role = useRole();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [validFrom, setValidFrom] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [agentPct, setAgentPct] = useState("15");
  const [managerPct, setManagerPct] = useState("5");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: solution } = useQuery<Solution | undefined>({
    queryKey: ["solutions", "all"],
    queryFn: async () => (await api.get("/catalog/solutions")).data,
    select: (all) => (all as unknown as Solution[]).find((s) => s._id === id),
    enabled: !!id,
  });

  const { data: versions = [] } = useQuery<SolutionVersion[]>({
    queryKey: ["solution-versions", id],
    queryFn: async () => (await api.get(`/catalog/solutions/${id}/versions`)).data,
    enabled: !!id,
  });

  const createVersion = useMutation({
    mutationFn: async () =>
      api.post(`/catalog/solutions/${id}/versions`, {
        validFrom: new Date(validFrom).toISOString(),
        basePriceCents: Math.round(parseFloat(basePrice) * 100),
        agentBp: Math.round(parseFloat(agentPct) * 100),
        managerBp: Math.round(parseFloat(managerPct) * 100),
        changeReason: reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solution-versions", id] });
      setShowForm(false);
      setValidFrom("");
      setBasePrice("");
      setReason("");
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
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
            <Field label="Agent commission %">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={agentPct}
                onChange={(e) => setAgentPct(e.target.value)}
              />
            </Field>
            <Field label="Manager commission %">
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
            <Th>Agent</Th>
            <Th>Manager</Th>
            <Th>Reason</Th>
          </THead>
          <TBody>
            {versions.length === 0 && (
              <Tr>
                <Td colSpan={6}>
                  <span className="text-slate-500">No versions yet.</span>
                </Td>
              </Tr>
            )}
            {versions.map((v) => (
              <Tr key={v._id}>
                <Td>{formatDate(v.validFrom)}</Td>
                <Td>
                  {v.validTo ? formatDate(v.validTo) : <Badge tone="green">Active</Badge>}
                </Td>
                <Td className="font-medium">{formatCents(v.basePriceCents, v.currency)}</Td>
                <Td>{formatBp(v.agentBp)}</Td>
                <Td>{formatBp(v.managerBp)}</Td>
                <Td className="text-slate-500">
                  {v.changeReason || <span className="text-slate-400">—</span>}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
