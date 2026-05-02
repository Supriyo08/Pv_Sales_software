import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Copy, Download, FileText, FileType2, Printer } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { DocxPreview } from "../components/DocxPreview";
import { DocumentActions } from "../components/DocumentActions";
import type { ContractTemplate, TemplateRenderResult } from "../lib/api-types";

export function TemplateRender() {
  const { id } = useParams<{ id: string }>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [omit, setOmit] = useState<Set<string>>(new Set());
  const [rendered, setRendered] = useState<string>("");
  const [missing, setMissing] = useState<string[]>([]);
  // For .docx templates: blob URL of the rendered .docx, fed into DocxPreview.
  const [docxBlobUrl, setDocxBlobUrl] = useState<string | null>(null);
  // Stash the latest blob so we can re-use it for the .docx download button.
  const docxBlobRef = useRef<Blob | null>(null);

  const { data: template } = useQuery<ContractTemplate>({
    queryKey: ["template", id],
    queryFn: async () => (await api.get(`/templates/${id}`)).data,
    enabled: !!id,
  });

  const isDocxTemplate = !!template?.sourceDocxPath;
  const placeholders = useMemo(() => template?.analysis.placeholders ?? [], [template]);
  const sections = useMemo(() => template?.analysis.sections ?? [], [template]);

  useEffect(() => {
    setValues({});
    setOmit(new Set());
    setRendered("");
    setMissing([]);
    if (docxBlobUrl) URL.revokeObjectURL(docxBlobUrl);
    setDocxBlobUrl(null);
    docxBlobRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Cleanup blob on unmount.
  useEffect(() => {
    return () => {
      if (docxBlobUrl) URL.revokeObjectURL(docxBlobUrl);
    };
  }, [docxBlobUrl]);

  const renderText = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<TemplateRenderResult>(`/templates/${id}/render`, {
        values,
        omitSections: [...omit],
      });
      return data;
    },
    onSuccess: (data) => {
      setRendered(data.text);
      setMissing(data.missingPlaceholders);
    },
  });

  const renderDocx = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/templates/${id}/render-docx`, { values }, {
        responseType: "blob",
      });
      const blob = res.data as Blob;
      docxBlobRef.current = blob;
      // Compute missing placeholders client-side (server doesn't return them
      // for the .docx path; same logic as the text endpoint).
      const next = placeholders.map((p) => p.tag).filter((tag) => !values[tag]);
      setMissing(next);
      const url = URL.createObjectURL(blob);
      if (docxBlobUrl) URL.revokeObjectURL(docxBlobUrl);
      setDocxBlobUrl(url);
      return url;
    },
  });

  const generate = () => {
    if (isDocxTemplate) renderDocx.mutate();
    else renderText.mutate();
  };

  const copy = () => {
    if (!rendered) return;
    navigator.clipboard.writeText(rendered);
  };

  const downloadTxt = () => {
    if (!rendered) return;
    const blob = new Blob([rendered], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${template?.name ?? "contract"}-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Print + Download PDF for the text-only preview path: use a dedicated
  // printable container so the toolbar component can find it.
  const textPreviewSelector = "#tpl-render-text-preview";

  if (!template) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <BackLink to="/templates">Back to templates</BackLink>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {template.name}
            {isDocxTemplate ? (
              <Badge tone="brand">
                <FileType2 className="size-3 inline mr-0.5" /> Word .docx
              </Badge>
            ) : (
              <Badge tone="neutral">HTML</Badge>
            )}
          </span>
        }
        description={template.description}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold mb-4">Fill the contract</h3>
          {placeholders.length === 0 && sections.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No fields to fill"
              description="This template has no placeholders or optional sections."
            />
          ) : (
            <div className="space-y-4">
              {placeholders.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Placeholders
                  </div>
                  <div className="space-y-3">
                    {placeholders.map(({ tag }) => (
                      <Field
                        key={tag}
                        label={`@@${tag}`}
                        hint={
                          missing.includes(tag)
                            ? `Missing — will render as [[${tag}]]`
                            : undefined
                        }
                      >
                        <Input
                          value={values[tag] ?? ""}
                          onChange={(e) =>
                            setValues({ ...values, [tag]: e.target.value })
                          }
                          placeholder={`Value for @@${tag}`}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              )}

              {sections.length > 0 && !isDocxTemplate && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Optional sections
                  </div>
                  <div className="space-y-2">
                    {sections.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-start gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={omit.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(omit);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            setOmit(next);
                          }}
                          className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <div className="text-sm">
                          <div className="font-medium text-slate-900">{s.label}</div>
                          <div className="text-xs text-slate-500">
                            Tick to <strong>remove</strong> this section from the contract
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {sections.length > 0 && isDocxTemplate && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Optional sections aren't applied for .docx-source templates in
                  v1.2 — only placeholder substitution is performed against the
                  original Word file.
                </div>
              )}

              <Button
                onClick={generate}
                loading={renderText.isPending || renderDocx.isPending}
              >
                {isDocxTemplate ? "Generate Word preview" : "Generate contract"}
              </Button>
            </div>
          )}
        </Card>

        <Card padding={isDocxTemplate ? false : true}>
          <div
            className={
              isDocxTemplate
                ? "px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap"
                : "flex items-center justify-between mb-3"
            }
          >
            <h3 className="font-semibold">Preview</h3>
            {isDocxTemplate ? (
              docxBlobUrl ? (
                <DocumentActions
                  src={docxBlobUrl}
                  mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  baseFilename={`${template.name.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}`}
                  printableSelector="#tpl-render-docx-preview .docx-preview-content"
                />
              ) : (
                <span className="text-xs text-slate-500">
                  Click "Generate Word preview" to render
                </span>
              )
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copy}
                  disabled={!rendered}
                  icon={<Copy className="size-3.5" />}
                >
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={downloadTxt}
                  disabled={!rendered}
                  icon={<Download className="size-3.5" />}
                >
                  Download .txt
                </Button>
                <PrintTextButton selector={textPreviewSelector} disabled={!rendered} />
                <DownloadTextAsPdfButton
                  selector={textPreviewSelector}
                  disabled={!rendered}
                  filename={`${template.name.replace(/\s+/g, "_")}.pdf`}
                />
              </div>
            )}
          </div>

          {missing.length > 0 && (
            <div
              className={
                isDocxTemplate
                  ? "px-6 py-2 border-b border-amber-200 bg-amber-50 text-xs text-amber-800"
                  : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-3"
              }
            >
              <strong>Missing values:</strong>{" "}
              {missing.map((m) => (
                <Badge key={m} tone="amber">
                  @@{m}
                </Badge>
              ))}
            </div>
          )}

          {isDocxTemplate ? (
            docxBlobUrl ? (
              <div id="tpl-render-docx-preview">
                <DocxPreview src={docxBlobUrl} flat />
              </div>
            ) : (
              <div className="px-6 py-12 text-sm text-slate-500 text-center">
                The Word document will appear here exactly as Word renders it,
                with placeholder values substituted.
              </div>
            )
          ) : (
            <div id={textPreviewSelector.slice(1)}>
              <Textarea
                value={
                  rendered ||
                  "Click 'Generate contract' to preview the rendered output."
                }
                readOnly
                rows={28}
                className="font-mono text-xs leading-relaxed min-h-[28rem] bg-slate-50"
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── small helpers for the text-preview path (PDF + Print) ────────────────

function PrintTextButton({
  selector,
  disabled,
}: {
  selector: string;
  disabled?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      icon={<Printer className="size-3.5" />}
      onClick={() => {
        const node = document.querySelector(selector);
        if (!node) return window.print();
        const styleNodes = document.querySelectorAll("style, link[rel='stylesheet']");
        const styles = Array.from(styleNodes).map((s) => s.outerHTML).join("\n");
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return document.body.removeChild(iframe);
        doc.open();
        doc.write(`<!doctype html><html><head><meta charset="utf-8"/>${styles}<style>body{margin:0;padding:24px;background:white;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;}</style></head><body>${(node as HTMLElement).innerText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body></html>`);
        doc.close();
        iframe.onload = () => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        };
      }}
    >
      Print
    </Button>
  );
}

function DownloadTextAsPdfButton({
  selector,
  disabled,
  filename,
}: {
  selector: string;
  disabled?: boolean;
  filename: string;
}) {
  return (
    <Button
      size="sm"
      disabled={disabled}
      icon={<Download className="size-3.5" />}
      onClick={async () => {
        const node = document.querySelector(selector) as HTMLElement | null;
        if (!node) return;
        const html2pdf = (await import("html2pdf.js")).default;
        const opts: Record<string, unknown> = {
          margin: [10, 10, 10, 10],
          filename,
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        };
        await html2pdf().set(opts as never).from(node).save();
      }}
    >
      Download PDF
    </Button>
  );
}
