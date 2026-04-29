import type { ReactNode } from "react";

type Tone = "neutral" | "brand" | "green" | "amber" | "red" | "blue";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ring-1 ring-inset",
        TONES[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

const STATUS_TO_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  SIGNED: "green",
  CANCELLED: "red",
  PENDING: "amber",
  PARTIAL: "blue",
  FULL: "green",
  DISPUTED: "red",
  SCHEDULED: "neutral",
  SURVEY: "blue",
  PERMITS: "amber",
  INSTALLED: "blue",
  ACTIVATED: "green",
  INSPECTED: "green",
  NEW: "neutral",
  QUALIFIED: "blue",
  PROPOSAL: "amber",
  WON: "green",
  LOST: "red",
  ADMIN: "brand",
  AREA_MANAGER: "blue",
  AGENT: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TO_TONE[status] ?? "neutral";
  return (
    <Badge tone={tone}>
      <span className={`size-1.5 rounded-full bg-current opacity-70`} />
      {status}
    </Badge>
  );
}
