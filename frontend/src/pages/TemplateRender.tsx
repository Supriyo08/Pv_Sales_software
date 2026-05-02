import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Copy, Download, FileText } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import type { ContractTemplate, TemplateRenderResult } from "../lib/api-types";

export function TemplateRender() {
  const { id } = useParams<{ id: string }>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [omit, setOmit] = useState<Set<string>>(new Set());
  const [rendered, setRendered] = useState<string>("");
  const [missing, setMissing] = useState<string[]>([]);

  const { data: template } = useQuery<ContractTemplate>({
    queryKey: ["template", id],
    queryFn: async () => (await api.get(`/templates/${id}`)).data,
    enabled: !!id,
  });

  const placeholders = useMemo(() => template?.analysis.placeholders ?? [], [template]);
  const sections = useMemo(() => template?.analysis.sections ?? [], [template]);

  useEffect(() => {
    // Reset state when template changes
    setValues({});
    setOmit(new Set());
    setRendered("");
    setMissing([]);
  }, [id]);

  const render = useMutation({
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

  const copy = () => {
    if (!rendered) return;
    navigator.clipboard.writeText(rendered);
  };

  const download = () => {
    if (!rendered) return;
    const blob = new Blob([rendered], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${template?.name ?? "contract"}-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!template) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <BackLink to="/templates">Back to templates</BackLink>
      <PageHeader title={template.name} description={template.description} />

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
                        hint={missing.includes(tag) ? "Missing — will render as [[" + tag + "]]" : undefined}
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

              {sections.length > 0 && (
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

              <Button onClick={() => render.mutate()} loading={render.isPending}>
                Generate contract
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Preview</h3>
            <div className="flex gap-2">
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
                onClick={download}
                disabled={!rendered}
                icon={<Download className="size-3.5" />}
              >
                Download .txt
              </Button>
            </div>
          </div>
          {missing.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-3">
              <strong>Missing values:</strong>{" "}
              {missing.map((m) => (
                <Badge key={m} tone="amber">
                  @{m}
                </Badge>
              ))}
            </div>
          )}
          <Textarea
            value={rendered || "Click 'Generate contract' to preview the rendered output."}
            readOnly
            rows={28}
            className="font-mono text-xs leading-relaxed min-h-[28rem] bg-slate-50"
          />
          <p className="text-xs text-slate-500 mt-2">
            Save this as a <Link to="/" className="text-brand-600 hover:underline">Document</Link>{" "}
            against a Contract by uploading the file via the Documents API once you have one signed.
          </p>
        </Card>
      </div>
    </div>
  );
}
