import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Map as MapIcon, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import type { Territory, User } from "../lib/api-types";

export function TerritoriesAdmin() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", parentId: "", managerId: "" });
  const [error, setError] = useState<string | null>(null);

  const { data: territories = [] } = useQuery<Territory[]>({
    queryKey: ["territories"],
    queryFn: async () => (await api.get("/territories")).data,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  const territoryById = new Map(territories.map((t) => [t._id, t]));
  const userById = new Map(users.map((u) => [u._id, u]));
  const areaManagers = users.filter((u) => u.role === "AREA_MANAGER");

  const create = useMutation({
    mutationFn: async () =>
      api.post("/territories", {
        name: form.name,
        parentId: form.parentId || undefined,
        managerId: form.managerId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["territories"] });
      setShowForm(false);
      setForm({ name: "", parentId: "", managerId: "" });
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/territories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["territories"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Territories"
        description="Geographic + organizational areas. Can be nested. Optionally assign an AREA_MANAGER."
        action={
          !showForm ? (
            <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />}>
              New territory
            </Button>
          ) : null
        }
      />

      {showForm && (
        <Card>
          <h3 className="font-semibold mb-4">New territory</h3>
          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Parent territory">
              <Select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              >
                <option value="">— None (top level) —</option>
                {territories.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Manager (AREA_MANAGER only)">
                <Select
                  value={form.managerId}
                  onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                >
                  <option value="">— None —</option>
                  {areaManagers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.email})
                    </option>
                  ))}
                </Select>
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
              Create territory
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <CardHeader title={`All territories (${territories.length})`} />
        {territories.length === 0 ? (
          <EmptyState
            icon={MapIcon}
            title="No territories"
            description="Add a territory to start mapping areas to managers."
          />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th>Parent</Th>
              <Th>Manager</Th>
              <Th></Th>
            </THead>
            <TBody>
              {territories.map((t) => (
                <Tr key={t._id}>
                  <Td className="font-medium">{t.name}</Td>
                  <Td className="text-slate-600">
                    {t.parentId ? territoryById.get(t.parentId)?.name ?? "—" : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td className="text-slate-600">
                    {t.managerId ? userById.get(t.managerId)?.fullName ?? "—" : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="size-3.5 text-red-500" />}
                      onClick={() => {
                        if (confirm(`Delete territory ${t.name}?`)) {
                          remove.mutate(t._id);
                        }
                      }}
                    >
                      <span className="text-red-600">Delete</span>
                    </Button>
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
