import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  FileText,
  FileCheck2,
  PencilLine,
  XCircle,
  Wrench,
  Wallet,
  RotateCcw,
  AlertOctagon,
  HandCoins,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { ContractHistoryEvent } from "../lib/api-types";

type Props = {
  contractId: string;
};

/**
 * Per Review 1.2 (2026-05-04): a chronological timeline of every meaningful
 * event in the contract's lifecycle — created, edits requested, generated,
 * approved, signed, scan uploaded, AM advance auth, commissions paid,
 * installation milestones, reversal reviews, cancellations.
 */
export function ContractHistory({ contractId }: Props) {
  const { data: events = [], isLoading } = useQuery<ContractHistoryEvent[]>({
    queryKey: ["contract-history", contractId],
    queryFn: async () =>
      (await api.get(`/contracts/${contractId}/history`)).data,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading history…</p>;
  }
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No history yet.</p>;
  }

  return (
    <ol className="relative pl-6 space-y-4">
      <span className="absolute left-2 top-2 bottom-2 w-px bg-slate-200" />
      {events.map((e, i) => (
        <TimelineRow key={`${e.at}-${e.kind}-${i}`} event={e} />
      ))}
    </ol>
  );
}

const KIND_META: Record<
  string,
  { icon: LucideIcon; tone: string; bg: string; ring: string }
> = {
  "contract.created": {
    icon: Sparkles,
    tone: "text-brand-700",
    bg: "bg-brand-100",
    ring: "ring-brand-200",
  },
  "contract.generated": {
    icon: FileText,
    tone: "text-amber-700",
    bg: "bg-amber-100",
    ring: "ring-amber-200",
  },
  "contract.generation_approved": {
    icon: FileCheck2,
    tone: "text-emerald-700",
    bg: "bg-emerald-100",
    ring: "ring-emerald-200",
  },
  "contract.signed": {
    icon: CheckCircle2,
    tone: "text-brand-700",
    bg: "bg-brand-100",
    ring: "ring-brand-200",
  },
  "contract.signed_scan_uploaded": {
    icon: FileText,
    tone: "text-slate-700",
    bg: "bg-slate-100",
    ring: "ring-slate-200",
  },
  "contract.approved": {
    icon: FileCheck2,
    tone: "text-emerald-700",
    bg: "bg-emerald-100",
    ring: "ring-emerald-200",
  },
  "contract.cancelled": {
    icon: XCircle,
    tone: "text-red-700",
    bg: "bg-red-100",
    ring: "ring-red-200",
  },
  "contract.edit_requested": {
    icon: PencilLine,
    tone: "text-amber-700",
    bg: "bg-amber-100",
    ring: "ring-amber-200",
  },
  "contract.edit_approved": {
    icon: CheckCircle2,
    tone: "text-emerald-700",
    bg: "bg-emerald-100",
    ring: "ring-emerald-200",
  },
  "contract.edit_rejected": {
    icon: XCircle,
    tone: "text-red-700",
    bg: "bg-red-100",
    ring: "ring-red-200",
  },
  "advance_pay_auth.requested": {
    icon: HandCoins,
    tone: "text-amber-700",
    bg: "bg-amber-100",
    ring: "ring-amber-200",
  },
  "advance_pay_auth.authorized": {
    icon: Wallet,
    tone: "text-emerald-700",
    bg: "bg-emerald-100",
    ring: "ring-emerald-200",
  },
  "advance_pay_auth.declined": {
    icon: XCircle,
    tone: "text-slate-700",
    bg: "bg-slate-100",
    ring: "ring-slate-200",
  },
  "commission.generated": {
    icon: Wallet,
    tone: "text-emerald-700",
    bg: "bg-emerald-100",
    ring: "ring-emerald-200",
  },
  "commission.superseded": {
    icon: RotateCcw,
    tone: "text-red-700",
    bg: "bg-red-100",
    ring: "ring-red-200",
  },
  "reversal_review.created": {
    icon: AlertOctagon,
    tone: "text-amber-700",
    bg: "bg-amber-100",
    ring: "ring-amber-200",
  },
  "reversal_review.revert": {
    icon: RotateCcw,
    tone: "text-red-700",
    bg: "bg-red-100",
    ring: "ring-red-200",
  },
  "reversal_review.keep": {
    icon: CheckCircle2,
    tone: "text-emerald-700",
    bg: "bg-emerald-100",
    ring: "ring-emerald-200",
  },
  "reversal_review.reduce": {
    icon: Wrench,
    tone: "text-amber-700",
    bg: "bg-amber-100",
    ring: "ring-amber-200",
  },
  "installation.cancelled": {
    icon: XCircle,
    tone: "text-red-700",
    bg: "bg-red-100",
    ring: "ring-red-200",
  },
};

function TimelineRow({ event }: { event: ContractHistoryEvent }) {
  const meta = KIND_META[event.kind] ?? {
    icon: event.kind.startsWith("installation.") ? Wrench : Circle,
    tone: "text-slate-700",
    bg: "bg-slate-100",
    ring: "ring-slate-200",
  };
  const Icon = meta.icon;
  return (
    <li className="relative">
      <span
        className={`absolute -left-[24px] top-0 inline-grid place-items-center size-6 rounded-full ${meta.bg} ${meta.tone} ring-4 ring-white shadow-sm`}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{event.title}</div>
        <div className="text-xs text-slate-500">{formatDateTime(event.at)}</div>
      </div>
      {event.detail && (
        <div className="mt-0.5 text-sm text-slate-600">{event.detail}</div>
      )}
    </li>
  );
}
