import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Package } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { useRole } from "../store/auth";
import type { Solution } from "../lib/api-types";

export function Solutions() {
  const role = useRole();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery<Solution[]>({
    queryKey: ["solutions"],
    queryFn: async () => (await api.get("/catalog/solutions")).data,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solutions"
        description="Versioned product catalog. Each solution has multiple versions over time."
        action={
          role === "ADMIN" && !showForm ? (
            <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />}>
              New solution
            </Button>
          ) : null
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
              <Th>Description</Th>
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
                  </Td>
                  <Td className="text-slate-600">
                    {s.description || <span className="text-slate-400">—</span>}
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
