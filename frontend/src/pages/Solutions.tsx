import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Package, Power, Archive, ArchiveRestore } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents } from "../lib/format";
import { useRole } from "../store/auth";
import type { SolutionEnriched } from "../lib/api-types";

export function Solutions() {
  const role = useRole();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [includeArchived, setIncludeArchived] = useState(false);

  const { data = [], isLoading } = useQuery<SolutionEnriched[]>({
    queryKey: ["solutions", "enriched", { includeArchived }],
    queryFn: async () =>
      (
        await api.get("/catalog/solutions", {
          params: { enriched: "true", includeArchived: includeArchived ? "true" : undefined },
        })
      ).data,
  });

  const create = useMutation({
    mutationFn: async () => api.post("/catalog/solutions", { name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solutions"] });
      setShowForm(false);
      setName("");
      setDescription("");
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const setActive = useMutation({
    mutationFn: async (input: { id: string; active: boolean }) =>
      api.patch(`/catalog/solutions/${input.id}/active`, { active: input.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solutions"] }),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => api.post(`/catalog/solutions/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solutions"] }),
  });

  const unarchive = useMutation({
    mutationFn: async (id: string) => api.post(`/catalog/solutions/${id}/unarchive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["solutions"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solutions"
        description="Versioned product catalog. Each solution has multiple versions, commission rates, and linked installment plans."
        action={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="size-3.5 rounded border-slate-300"
              />
              Show archived
            </label>
            {role === "ADMIN" && !showForm && (
              <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />}>
                New solution
              </Button>
            )}
          </div>
        }
      />
      {showForm && (
        <Card>
          <h3 className="font-semibold mb-4">New solution</h3>
          <div className="space-y-4 max-w-md">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => create.mutate()} loading={create.isPending}>
                Create
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Card padding={false}>
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No solutions yet"
            description={role === "ADMIN" ? "Create your first solution to start cataloguing pricing." : "An admin needs to create solutions first."}
          />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Active version</Th>
              <Th>Agent %</Th>
              <Th>Manager %</Th>
              <Th>Installment plans</Th>
              {role === "ADMIN" && <Th>Actions</Th>}
            </THead>
            <TBody>
              {data.map((s) => (
                <Tr key={s._id}>
                  <Td>
                    <Link
                      to={`/solutions/${s._id}`}
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      {s.name}
                    </Link>
                    {s.description && (
                      <div className="text-xs text-slate-500 mt-0.5">{s.description}</div>
                    )}
                  </Td>
                  <Td>
                    {s.deletedAt ? (
                      <Badge tone="neutral">archived</Badge>
                    ) : s.active ? (
                      <Badge tone="green">active</Badge>
                    ) : (
                      <Badge tone="amber">inactive</Badge>
                    )}
                  </Td>
                  <Td className="text-sm">
                    {s.activeVersion ? (
                      formatCents(
                        s.activeVersion.basePriceCents,
                        s.activeVersion.currency
                      )
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-sm">
                    {s.activeVersion ? (
                      `${(s.activeVersion.agentBp / 100).toFixed(2)}%`
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-sm">
                    {s.activeVersion ? (
                      `${(s.activeVersion.managerBp / 100).toFixed(2)}%`
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-xs">
                    {s.installmentPlans.length === 0 ? (
                      <span className="text-slate-400">— none —</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.installmentPlans.slice(0, 3).map((p) => (
                          <Badge key={p._id} tone="neutral">
                            {p.name} · {p.months}mo
                          </Badge>
                        ))}
                        {s.installmentPlans.length > 3 && (
                          <span className="text-slate-500">
                            +{s.installmentPlans.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </Td>
                  {role === "ADMIN" && (
                    <Td>
                      <div className="flex gap-1">
                        {!s.deletedAt && (
                          <button
                            type="button"
                            onClick={() =>
                              setActive.mutate({ id: s._id, active: !s.active })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-600 hover:bg-slate-100"
                            title={s.active ? "Deactivate" : "Activate"}
                          >
                            <Power className="size-3.5" />{" "}
                            {s.active ? "Deactivate" : "Activate"}
                          </button>
                        )}
                        {s.deletedAt ? (
                          <button
                            type="button"
                            onClick={() => unarchive.mutate(s._id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-brand-600 hover:bg-brand-50"
                          >
                            <ArchiveRestore className="size-3.5" /> Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Archive "${s.name}"? Hidden everywhere.`))
                                archive.mutate(s._id);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 hover:bg-red-50"
                          >
                            <Archive className="size-3.5" /> Archive
                          </button>
                        )}
                      </div>
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
