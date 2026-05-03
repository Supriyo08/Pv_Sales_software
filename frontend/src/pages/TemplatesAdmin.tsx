import { useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Archive,
  ArchiveRestore,
  Edit3,
  Eye,
  Plus,
  ShieldAlert,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  FileType2,
  History as HistoryIcon,
} from "lucide-react";
import { api, uploadUrl } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { RichTextEditor } from "../components/ui/RichTextEditor";
import { DocxPreview } from "../components/DocxPreview";
import { DocumentActions } from "../components/DocumentActions";
import { TemplateHistoryModal } from "../components/TemplateHistoryModal";
import { Modal } from "../components/ui/Modal";
import { formatDate } from "../lib/format";
import { useRole } from "../store/auth";
import type { ContractTemplate, Solution } from "../lib/api-types";

// Per follow-up to Review 1.1 (2026-05-02): placeholders are @@tag (double @).
// Single @ is reserved for literal text (e.g. email addresses like info@edilteca.it).
const PLACEHOLDER_RE = /@@([a-zA-Z_][a-zA-Z0-9_]*)/g;
const SECTION_RE = /\[\[OPTIONAL:([a-zA-Z_][a-zA-Z0-9_]*)(?:\|([^\]]+))?\]\]/g;

const SAMPLE = `<h1>CONTRACT FOR PHOTOVOLTAIC SYSTEM</h1>

<p><strong>Customer:</strong> @@customer_name<br/>
<strong>Fiscal code:</strong> @@fiscal_code<br/>
<strong>Address:</strong> @@address</p>

<p><strong>Total amount:</strong> €@@amount<br/>
<strong>Installation date:</strong> @@install_date</p>

<p>[[OPTIONAL:warranty|Extended 10-year warranty]]
The Provider extends an additional 10-year warranty on all panels, inverter, and labour.
[[/OPTIONAL]]</p>

<p>[[OPTIONAL:financing|Financing terms]]
Total amount split into @@months monthly instalments of €@@monthly,
direct-debit on the @@direct_debit_day of each month.
[[/OPTIONAL]]</p>

<p>Signed in @@city on @@date.</p>

<p>Customer signature: ____________________</p>`;

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
  const role = useRole();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [showHtmlBody, setShowHtmlBody] = useState(false);
  // For previewing any template's source .docx in a modal from the list.
  const [previewing, setPreviewing] = useState<ContractTemplate | null>(null);
  // Per Review 1.2 (2026-05-04): version history modal.
  const [historyTemplate, setHistoryTemplate] = useState<ContractTemplate | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    body: SAMPLE,
    active: true,
    solutionIds: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: templates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ["templates", { includeArchived }],
    queryFn: async () =>
      (
        await api.get("/templates", {
          params: { includeArchived: includeArchived ? "true" : undefined },
        })
      ).data,
  });

  const { data: solutions = [] } = useQuery<Solution[]>({
    queryKey: ["solutions"],
    queryFn: async () => (await api.get("/catalog/solutions")).data,
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
          solutionIds: form.solutionIds,
        });
      }
      return api.post("/templates", {
        name: form.name,
        description: form.description,
        body: form.body,
        active: form.active,
        solutionIds: form.solutionIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      reset();
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const uploadTemplate = useMutation({
    mutationFn: async (file: File) => {
      const baseName =
        window.prompt(
          "Template name?",
          file.name.replace(/\.[^.]+$/, "")
        )?.trim() ?? "";
      if (!baseName) throw new Error("Cancelled");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", baseName);
      fd.append("solutionIds", JSON.stringify(form.solutionIds));
      return api.post<ContractTemplate>("/templates/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) =>
      setError(err?.response?.data?.error ?? err.message ?? "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  // Per Review 1.2 (2026-05-04): bring an archived template back.
  const restore = useMutation({
    mutationFn: async (id: string) => api.post(`/templates/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });

  const reset = () => {
    setEditingId(null);
    setEditorOpen(false);
    setShowHtmlBody(false);
    setForm({ name: "", description: "", body: SAMPLE, active: true, solutionIds: [] });
    setError(null);
  };

  const startEdit = (t: ContractTemplate) => {
    setEditingId(t._id);
    setEditorOpen(true);
    setShowHtmlBody(!t.sourceDocxPath); // .docx-source templates hide the HTML body by default
    setForm({
      name: t.name,
      description: t.description,
      body: t.body,
      active: t.active,
      solutionIds: t.solutionIds ?? [],
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const editingTemplate = editingId
    ? templates.find((t) => t._id === editingId) ?? null
    : null;

  const openNew = () => {
    setEditingId(null);
    setEditorOpen(true);
    setForm({ name: "", description: "", body: SAMPLE, active: true, solutionIds: [] });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSolution = (id: string) => {
    setForm((s) => ({
      ...s,
      solutionIds: s.solutionIds.includes(id)
        ? s.solutionIds.filter((x) => x !== id)
        : [...s.solutionIds, id],
    }));
  };

  // Defensive: only ADMIN can manage templates. Backend already enforces; this avoids confusion if a non-admin lands here.
  if (role && role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contract templates"
        description="Build templates with @@placeholders and [[OPTIONAL:id|label]]…[[/OPTIONAL]] sections. Agents pick a template, fill the form, and the system generates the contract document. Upload .docx to keep the original Word formatting end-to-end."
        action={
          !editorOpen ? (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="size-3.5 rounded border-slate-300"
                />
                Show archived
              </label>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                icon={<UploadCloud className="size-4" />}
              >
                Upload .docx / .html
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,.docx,.txt,text/html,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadTemplate.mutate(file);
                }}
              />
              <Button onClick={openNew} icon={<Plus className="size-4" />}>
                New template
              </Button>
            </div>
          ) : null
        }
      />

      {uploadTemplate.isPending && (
        <Card className="border-brand-200 bg-brand-50/40">
          <p className="text-sm text-brand-900">
            <UploadCloud className="size-4 inline mr-2" />
            Uploading template…
          </p>
        </Card>
      )}

      {!editorOpen && (
        <Card className="border-amber-200 bg-amber-50/50">
          <div className="flex items-start gap-3">
            <ShieldAlert className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              Only <strong>admins</strong> can create or edit templates. Agents and area
              managers can render existing templates from the table below.
            </div>
          </div>
        </Card>
      )}

      {editorOpen && (
      <Card>
        <h3 className="font-semibold mb-1">{editingId ? "Edit template" : "New template"}</h3>
        <p className="text-sm text-slate-500 mb-4">
          Use <code className="bg-slate-100 px-1 rounded">@@field_name</code> (double @)
          for inline placeholders — single @ is left alone so emails like{" "}
          <code className="bg-slate-100 px-1 rounded">info@edilteca.it</code> stay
          intact. Use{" "}
          <code className="bg-slate-100 px-1 rounded">
            [[OPTIONAL:id|Label]]…[[/OPTIONAL]]
          </code>{" "}
          to mark sections an agent can drop with a checkbox (HTML / TipTap
          templates only).
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
            {editingTemplate?.sourceDocxPath ? (
              <Field
                label="Source Word document"
                hint="This template was uploaded as .docx — the original Word file is the source-of-truth and is rendered below exactly as Microsoft Word would show it. Generated contracts mirror this view."
              >
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <FileType2 className="size-4 text-brand-600" />
                      <span className="font-medium">.docx fidelity preview</span>
                    </div>
                    <DocumentActions
                      src={uploadUrl(editingTemplate.sourceDocxPath)}
                      mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      baseFilename={editingTemplate.name.replace(/\s+/g, "_")}
                      printableSelector="#template-edit-docx-preview .docx-preview-content"
                    />
                  </div>
                  <div id="template-edit-docx-preview">
                    <DocxPreview src={uploadUrl(editingTemplate.sourceDocxPath)} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700"
                >
                  <UploadCloud className="size-3.5" /> Replace with a new .docx
                </button>
                <button
                  type="button"
                  onClick={() => setShowHtmlBody((v) => !v)}
                  className="mt-2 ml-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  {showHtmlBody ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                  {showHtmlBody ? "Hide" : "Show"} HTML body (used as fallback &amp; analyzer source)
                </button>
                {showHtmlBody && (
                  <div className="mt-3">
                    <RichTextEditor
                      value={form.body}
                      onChange={(html) => setForm((s) => ({ ...s, body: html }))}
                      placeholder="Mammoth-converted HTML, kept in sync with placeholder analysis"
                    />
                  </div>
                )}
              </Field>
            ) : (
              <Field label="Body" required>
                <RichTextEditor
                  value={form.body}
                  onChange={(html) => setForm((s) => ({ ...s, body: html }))}
                  placeholder="Compose the contract template…"
                />
              </Field>
            )}
            <Field
              label="Restrict to solutions"
              hint="Empty = applies to all solutions. Otherwise, only contracts whose solution matches will be able to use this template."
            >
              <div className="flex flex-wrap gap-2">
                {solutions.length === 0 && (
                  <span className="text-xs text-slate-500">No solutions yet.</span>
                )}
                {solutions.map((s) => {
                  const on = form.solutionIds.includes(s._id);
                  return (
                    <button
                      key={s._id}
                      type="button"
                      onClick={() => toggleSolution(s._id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        on
                          ? "bg-brand-50 border-brand-300 text-brand-700"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
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
                    @@{p}
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
          <Button variant="outline" onClick={reset}>
            {editingId ? "Cancel edit" : "Cancel"}
          </Button>
        </div>
      </Card>
      )}

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
              <Th>Format</Th>
              <Th>Placeholders</Th>
              <Th>Sections</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th></Th>
            </THead>
            <TBody>
              {templates.map((t) => {
                const archived = !!(t as ContractTemplate & { deletedAt?: string | null }).deletedAt;
                return (
                <Tr key={t._id} className={archived ? "opacity-60" : ""}>
                  <Td>
                    <div className="font-medium text-slate-900 flex items-center gap-2">
                      {t.name}
                      {archived && <Badge tone="neutral">Archived</Badge>}
                    </div>
                    {t.description && (
                      <div className="text-xs text-slate-500">{t.description}</div>
                    )}
                  </Td>
                  <Td>
                    {t.sourceDocxPath ? (
                      <Badge tone="brand">
                        <FileType2 className="size-3 inline mr-0.5" /> Word .docx
                      </Badge>
                    ) : (
                      <Badge tone="neutral">HTML</Badge>
                    )}
                  </Td>
                  <Td className="text-xs">{t.analysis.placeholders.length}</Td>
                  <Td className="text-xs">{t.analysis.sections.length}</Td>
                  <Td>
                    {archived ? (
                      <Badge tone="neutral">Archived</Badge>
                    ) : t.active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDate(t.updatedAt)}</Td>
                  <Td>
                    <div className="flex gap-1 flex-wrap">
                      {!archived && (t.sourceDocxPath ? (
                        <button
                          onClick={() => setPreviewing(t)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-brand-600 hover:bg-brand-50"
                        >
                          <Eye className="size-3.5" /> Preview
                        </button>
                      ) : (
                        <Link
                          to={`/templates/${t._id}/render`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-brand-600 hover:bg-brand-50"
                        >
                          <Eye className="size-3.5" /> Render
                        </Link>
                      ))}
                      {!archived && (
                        <button
                          onClick={() => startEdit(t)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          <Edit3 className="size-3.5" /> Edit
                        </button>
                      )}
                      <button
                        onClick={() => setHistoryTemplate(t)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-100"
                        title="Version history"
                      >
                        <HistoryIcon className="size-3.5" /> History
                      </button>
                      {archived ? (
                        <button
                          onClick={() => restore.mutate(t._id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          <ArchiveRestore className="size-3.5" /> Restore
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (confirm(`Archive template "${t.name}"? You can restore it later from "Show archived".`))
                              remove.mutate(t._id);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          <Archive className="size-3.5" /> Archive
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-2">Quick reference</h3>
        <div className="grid md:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="font-medium text-slate-700 mb-1">Placeholders</div>
            <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-x-auto">{`Hello @@customer_name,
your order of €@@amount.

Contact: info@edilteca.it
(literal email — single @ is left alone)`}</pre>
            <p className="text-xs text-slate-500 mt-1">
              Each <code className="bg-slate-100 px-1">@@tag</code> becomes a form field
              for the agent. A single <code className="bg-slate-100 px-1">@</code> is
              treated as plain text — emails stay intact.
            </p>
          </div>
          <div>
            <div className="font-medium text-slate-700 mb-1">Optional sections</div>
            <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-x-auto">{`[[OPTIONAL:warranty|Extended warranty]]
Warranty body text...
[[/OPTIONAL]]`}</pre>
            <p className="text-xs text-slate-500 mt-1">
              Agent sees a checkbox labeled "Extended warranty"; ticking{" "}
              <strong>removes</strong> the section from the rendered contract.
              <br />
              <em>HTML / TipTap templates only.</em>
            </p>
          </div>
          <div>
            <div className="font-medium text-slate-700 mb-1">Upload .docx</div>
            <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-x-auto">{`Type @@nome_agente
in your Word doc, save,
upload here.`}</pre>
            <p className="text-xs text-slate-500 mt-1">
              Generated contracts are exported as <strong>.docx</strong> with the
              original Word formatting preserved (fonts, tables, headers,
              images). Type each placeholder uniformly — Word may split runs if
              you change formatting mid-tag.
            </p>
          </div>
        </div>
      </Card>

      <TemplatePreviewModal
        template={previewing}
        onClose={() => setPreviewing(null)}
      />

      <TemplateHistoryModal
        template={historyTemplate}
        onClose={() => setHistoryTemplate(null)}
      />
    </div>
  );
}

// ─── Preview-with-fill modal ────────────────────────────────────────────────
// Per follow-up to Review 1.1 (round 3, 2026-05-02): the preview modal now
// shows the placeholder fields the analyzer detected and lets the user render
// the .docx with their values inline — no need to leave the page.
//
// Two preview states:
//   - default → source .docx (no substitutions)
//   - rendered → blob from POST /v1/templates/:id/render-docx with the
//     entered values (placeholders not provided fall back to "[[tag]]")
//
// All toolbar actions (Print / Download .docx / Download PDF) operate on
// whichever preview is currently shown.

import { useEffect } from "react";

function TemplatePreviewModal({
  template,
  onClose,
}: {
  template: ContractTemplate | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);

  // Reset when the modal opens for a different template.
  useEffect(() => {
    setValues({});
    if (renderedUrl) URL.revokeObjectURL(renderedUrl);
    setRenderedUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?._id]);

  // Cleanup blob on unmount.
  useEffect(() => {
    return () => {
      if (renderedUrl) URL.revokeObjectURL(renderedUrl);
    };
  }, [renderedUrl]);

  const renderDocxMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        `/templates/${template!._id}/render-docx`,
        { values },
        { responseType: "blob" }
      );
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      if (renderedUrl) URL.revokeObjectURL(renderedUrl);
      setRenderedUrl(url);
      return url;
    },
  });

  if (!template) {
    return (
      <Modal open={false} onOpenChange={onClose} title="">
        <></>
      </Modal>
    );
  }

  const placeholders = template.analysis?.placeholders ?? [];
  const sourceUrl = template.sourceDocxPath ? uploadUrl(template.sourceDocxPath) : "";
  const previewUrl = renderedUrl ?? sourceUrl;
  const showingRendered = !!renderedUrl;
  const baseFilename =
    template.name.replace(/\s+/g, "_") +
    (showingRendered ? "-filled" : "");

  return (
    <Modal
      open={!!template}
      onOpenChange={(o) => !o && onClose()}
      title={`Preview — ${template.name}`}
      description={
        showingRendered
          ? "Showing the substituted Word document. Print or download to share with the customer."
          : "Showing the original Word file. Fill placeholders on the left and click Render to substitute."
      }
      size="xl"
      footer={
        previewUrl ? (
          <div className="flex items-center justify-between w-full gap-3 flex-wrap">
            <div className="text-xs text-slate-500">
              {showingRendered ? (
                <span className="text-emerald-700 font-medium">
                  Rendered with {Object.values(values).filter(Boolean).length}/
                  {placeholders.length} values
                </span>
              ) : (
                <>
                  Source:{" "}
                  <code className="font-mono">{template.sourceDocxPath}</code>
                </>
              )}
            </div>
            <DocumentActions
              src={previewUrl}
              mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              baseFilename={baseFilename}
              printableSelector="#template-list-docx-preview .docx-preview-content"
            />
          </div>
        ) : null
      }
    >
      {!template.sourceDocxPath ? (
        <p className="text-sm text-slate-500">
          This template has no .docx source — open the standalone render page
          for the HTML/text preview.
        </p>
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-4">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Fill placeholders ({placeholders.length})
            </div>
            {placeholders.length === 0 ? (
              <p className="text-xs text-slate-500">
                This template has no <code>@@placeholders</code> — the preview
                shows it as-is.
              </p>
            ) : (
              <>
                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {placeholders.map((p) => (
                    <Field key={p.tag} label={`@@${p.tag}`}>
                      <Input
                        value={values[p.tag] ?? ""}
                        onChange={(e) =>
                          setValues((s) => ({
                            ...s,
                            [p.tag]: e.target.value,
                          }))
                        }
                        placeholder={`Value for @@${p.tag}`}
                      />
                    </Field>
                  ))}
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-200">
                  <Button
                    onClick={() => renderDocxMutation.mutate()}
                    loading={renderDocxMutation.isPending}
                  >
                    {showingRendered ? "Re-render" : "Render with values"}
                  </Button>
                  {showingRendered && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (renderedUrl) URL.revokeObjectURL(renderedUrl);
                        setRenderedUrl(null);
                      }}
                    >
                      Show source
                    </Button>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Empty fields render as <code>[[tag]]</code> sentinels in the
                    output so you can spot what's missing.
                  </p>
                </div>
              </>
            )}
          </div>

          <div id="template-list-docx-preview" className="min-w-0">
            {showingRendered && (
              <div className="mb-2 inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                <FileType2 className="size-3" /> Rendered preview
              </div>
            )}
            <DocxPreview src={previewUrl} flat />
          </div>
        </div>
      )}
    </Modal>
  );
}
