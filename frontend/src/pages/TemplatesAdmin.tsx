import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Edit3, Eye } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDate } from "../lib/format";
import type { ContractTemplate } from "../lib/api-types";

const PLACEHOLDER_RE = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
const SECTION_RE = /\[\[OPTIONAL:([a-zA-Z_][a-zA-Z0-9_]*)(?:\|([^\]]+))?\]\]/g;

const SAMPLE = `CONTRACT FOR PHOTOVOLTAIC SYSTEM

Customer: @customer_name
Fiscal code: @fiscal_code
Address: @address

Total amount: €@amount
Installation date: @install_date

[[OPTIONAL:warranty|Extended 10-year warranty]]
The Provider extends an additional 10-year warranty on all panels, inverter, and labour.
[[/OPTIONAL]]

[[OPTIONAL:financing|Financing terms]]
Total amount split into @months monthly instalments of €@monthly,
direct-debit on the @direct_debit_day of each month.
[[/OPTIONAL]]

Signed in @city on @date.

Customer signature: ____________________`;

function analyzeLocally(body: string) {
  const placeholders = new Set<string>();
  for (const m of body.matchAll(PLACEHOLDER_RE)) placeholders.add(m[1]!);
  const sections: { id: string; label: string }[] = [];
  const seenSections = new Set<string>();
  for (const m of body.matchAll(SECTION_RE)) {
    if (!seenSections.has(m[1]!)) {
      seenSections.add(m[1]!);
      sections.push({ id: m[1]!, label: m[2] ?? m[1]! });
    }
  }
  return { placeholders: [...placeholders], sections };
}

export function TemplatesAdmin() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    body: SAMPLE,
    active: true,
  });
  const [error, setError] = useState<string | null>(null);

  const { data: templates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["templates"],
    queryFn: async () => (await api.get("/templates")).data,
  });

  const local = useMemo(() => analyzeLocally(form.body), [form.body]);

  const save = useMutation({
    mutationFn: async () => {
      if (editingId) {
        return api.patch(`/templates/${editingId}`, {
          name: form.name,
          description: form.description,
          body: form.body,
          active: form.active,
        });
      }
      return api.post("/templates", {
        name: form.name,
        description: form.description,
        body: form.body,
        active: form.active,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      reset();
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  const reset = () => {
    setEditingId(null);
    setForm({ name: "", description: "", body: SAMPLE, active: true });
    setError(null);
  };

  const startEdit = (t: ContractTemplate) => {
    setEditingId(t._id);
    setForm({
      name: t.name,
      description: t.description,
      body: t.body,
      active: t.active,
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contract templates"
        description="Build templates with @placeholders and [[OPTIONAL:id|label]]…[[/OPTIONAL]] sections. Agents pick a template, fill the form, and the system generates the contract document."
      />

      <Card>
        <h3 className="font-semibold mb-1">{editingId ? "Edit template" : "New template"}</h3>
        <p className="text-sm text-slate-500 mb-4">
          Use <code className="bg-slate-100 px-1 rounded">@field_name</code> for
          inline placeholders and{" "}
          <code className="bg-slate-100 px-1 rounded">
            [[OPTIONAL:id|Label]]…[[/OPTIONAL]]
          </code>{" "}
          to mark sections an agent can drop with a checkbox.
        </p>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Field label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="Body" required>
              <Textarea
                value={form.body}
                onChange={(e) =>
                  setForm({ ...form, body: (e.target as HTMLTextAreaElement).value })
                }
                rows={20}
                required
                className="font-mono text-xs leading-relaxed min-h-96"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Active (selectable by agents)
            </label>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Live analysis
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">
                Placeholders ({local.placeholders.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {local.placeholders.length === 0 && (
                  <span className="text-xs text-slate-400">— none yet —</span>
                )}
                {local.placeholders.map((p) => (
                  <Badge key={p} tone="brand">
                    @{p}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">
                Optional sections ({local.sections.length})
              </div>
              <div className="space-y-1">
                {local.sections.length === 0 && (
                  <span className="text-xs text-slate-400">— none yet —</span>
                )}
                {local.sections.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 text-xs bg-slate-50 px-2 py-1 rounded"
                  >
                    <code className="font-mono text-brand-600">{s.id}</code>
                    <span className="text-slate-600">— {s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            {editingId ? "Save changes" : "Create template"}
          </Button>
          {editingId && (
            <Button variant="outline" onClick={reset}>
              Cancel edit
            </Button>
          )}
        </div>
      </Card>

      <Card padding={false}>
        <CardHeader title={`All templates (${templates.length})`} />
        {templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates yet"
            description="Create your first template above. Agents will see active templates in the contract render flow."
          />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th>Placeholders</Th>
              <Th>Sections</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th></Th>
            </THead>
            <TBody>
              {templates.map((t) => (
                <Tr key={t._id}>
                  <Td>
                    <div className="font-medium text-slate-900">{t.name}</div>
                    {t.description && (
                      <div className="text-xs text-slate-500">{t.description}</div>
                    )}
                  </Td>
                  <Td className="text-xs">{t.analysis.placeholders.length}</Td>
                  <Td className="text-xs">{t.analysis.sections.length}</Td>
                  <Td>
                    {t.active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDate(t.updatedAt)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Link
                        to={`/templates/${t._id}/render`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-brand-600 hover:bg-brand-50"
                      >
                        <Eye className="size-3.5" /> Render
                      </Link>
                      <button
                        onClick={() => startEdit(t)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Edit3 className="size-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete template ${t.name}?`)) remove.mutate(t._id);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-2">Quick reference</h3>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <div className="font-medium text-slate-700 mb-1">Placeholders</div>
            <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-x-auto">{`Hello @customer_name,
your order of €@amount...`}</pre>
            <p className="text-xs text-slate-500 mt-1">
              Each <code className="bg-slate-100 px-1">@tag</code> becomes a form field for the
              agent.
            </p>
          </div>
          <div>
            <div className="font-medium text-slate-700 mb-1">Optional sections</div>
            <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-x-auto">{`[[OPTIONAL:warranty|Extended warranty]]
Warranty body text...
[[/OPTIONAL]]`}</pre>
            <p className="text-xs text-slate-500 mt-1">
              Agent sees a checkbox labeled "Extended warranty"; ticking <strong>removes</strong>{" "}
              the section from the rendered contract.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
