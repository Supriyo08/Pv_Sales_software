import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  UploadCloud,
  Archive,
  ArchiveRestore,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "./ui/Modal";
import { Badge } from "./ui/Badge";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { AuditLog, ContractTemplate } from "../lib/api-types";

type Props = {
  template: ContractTemplate | null;
  onClose: () => void;
};

/**
 * Per Review 1.2 (2026-05-04): per-template version history. Reads the audit
 * log entries for the template and renders them as a vertical timeline. For
 * `template.update` actions it computes a field-level diff between the
 * `before` and `after` snapshots so admins can see exactly what changed.
 */
export function TemplateHistoryModal({ template, onClose }: Props) {
  const { data: entries = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["template-history", template?._id],
    queryFn: async () =>
      (await api.get(`/templates/${template!._id}/history`)).data,
    enabled: !!template,
  });

  return (
    <Modal
      open={!!template}
      onOpenChange={(o) => !o && onClose()}
      title={template ? `Version history — ${template.name}` : ""}
      description="Every save, upload, archive and restore on this template, oldest first. Diff shows which fields changed each save."
      size="xl"
    >
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-500">No history recorded.</p>
      ) : (
        <ol className="relative pl-8 space-y-5">
          <span className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />
          {entries.map((e, idx) => (
            <HistoryRow
              key={e._id}
              entry={e}
              previous={idx > 0 ? entries[idx - 1] : null}
            />
          ))}
        </ol>
      )}
    </Modal>
  );
}

const ACTION_META: Record<
  string,
  { label: string; icon: LucideIcon; tone: "brand" | "amber" | "green" | "red" | "neutral" }
> = {
  "template.create": { label: "Created", icon: Plus, tone: "brand" },
  "template.update": { label: "Edited", icon: Pencil, tone: "amber" },
  "template.upload": { label: "Uploaded .docx / .html", icon: UploadCloud, tone: "brand" },
  "template.delete": { label: "Archived", icon: Archive, tone: "neutral" },
  "template.restore": { label: "Restored", icon: ArchiveRestore, tone: "green" },
};

const TRACKED_FIELDS = [
  "name",
  "description",
  "active",
  "solutionIds",
  "body",
  "sourceDocxPath",
] as const;

function diffFields(before: unknown, after: unknown): string[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") {
    return [];
  }
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const changed: string[] = [];
  for (const key of TRACKED_FIELDS) {
    const bv = JSON.stringify(b[key] ?? null);
    const av = JSON.stringify(a[key] ?? null);
    if (bv !== av) changed.push(key);
  }
  return changed;
}

function snippet(value: unknown, max = 80): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const cleaned = value.replace(/\s+/g, " ").trim();
    return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
  }
  if (Array.isArray(value)) return `[${value.length} items]`;
  return String(value);
}

function HistoryRow({
  entry,
  previous,
}: {
  entry: AuditLog;
  previous: AuditLog | null;
}) {
  const meta = ACTION_META[entry.action] ?? {
    label: entry.action,
    icon: Clock,
    tone: "neutral" as const,
  };
  const Icon = meta.icon;
  // For updates, compute diff against the entry's own `before` snapshot.
  // For creates, there's nothing to compare; just show the body length.
  const changed =
    entry.action === "template.update"
      ? diffFields(entry.before, entry.after)
      : [];
  const after = entry.after as Record<string, unknown> | null;
  const before = entry.before as Record<string, unknown> | null;

  return (
    <li className="relative">
      <span className="absolute -left-[28px] top-0 inline-grid place-items-center size-7 rounded-full bg-white ring-4 ring-white shadow-sm border border-slate-200">
        <Icon className="size-3.5 text-slate-600" />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">
            {meta.label}
          </span>
          <Badge tone={meta.tone}>{entry.action}</Badge>
          {entry.action === "template.update" && changed.length === 0 && (
            <span className="text-xs text-slate-400">
              (no tracked field changed)
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {formatDateTime(entry.createdAt)} · actor{" "}
          <code className="font-mono">{entry.actorId.slice(-6)}</code>
        </div>
      </div>

      {changed.length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          {changed.map((field) => (
            <div key={field} className="text-xs">
              <div className="font-semibold text-slate-700 mb-1">{field}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="rounded bg-red-50 border border-red-100 px-2 py-1.5 text-red-900 font-mono whitespace-pre-wrap break-words">
                  − {snippet(before?.[field], 200)}
                </div>
                <div className="rounded bg-emerald-50 border border-emerald-100 px-2 py-1.5 text-emerald-900 font-mono whitespace-pre-wrap break-words">
                  + {snippet(after?.[field], 200)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {entry.action === "template.create" && after && (
        <div className="mt-2 text-xs text-slate-600">
          Initial body: <em>{snippet(after.body, 120)}</em>
        </div>
      )}

      {entry.action === "template.upload" && entry.metadata && (
        <div className="mt-2 text-xs text-slate-600">
          {String((entry.metadata as Record<string, unknown>).filename ?? "")}
          {" · "}
          <code className="font-mono">
            {String((entry.metadata as Record<string, unknown>).mimeType ?? "")}
          </code>
        </div>
      )}

      {previous /* used to silence the unused-prop warning */ && null}
    </li>
  );
}
