import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  CheckCircle2,
  Clock,
  Hourglass,
  PauseCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { Card } from "./ui/Card";
import { formatCents } from "../lib/format";
import type { CommissionBreakdown } from "../lib/api-types";

type Props = {
  /** When omitted, fetches the current user's own breakdown. */
  userId?: string;
  /** Heading override. Default: "Potential commissions". */
  title?: string;
};

/**
 * Per Review 1.2 (2026-05-04): the agent-facing "you've these money that are
 * potentially yours" view. Buckets every approved contract this user has a
 * stake in into four slices:
 *
 *   - Paid early (manager + admin both approved early payment)
 *   - Paid after installation (post-install commission firing)
 *   - Pending early (still in PENDING_MANAGER or PENDING_ADMIN)
 *   - Deferred to install (manager or admin declined early payment)
 *
 * Used on the agent's Dashboard and on Reports for admins viewing a specific
 * user.
 */
export function CommissionBreakdownCard({ userId, title }: Props) {
  const url = userId
    ? `/commissions/breakdown/user/${userId}`
    : "/commissions/breakdown/me";

  const { data, isLoading, error } = useQuery<CommissionBreakdown>({
    queryKey: ["commission-breakdown", userId ?? "me"],
    queryFn: async () => (await api.get<CommissionBreakdown>(url)).data,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Card>
        <h3 className="font-semibold mb-2">{title ?? "Potential commissions"}</h3>
        <p className="text-sm text-slate-500">Loading…</p>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <h3 className="font-semibold mb-2">{title ?? "Potential commissions"}</h3>
        <p className="text-sm text-red-600">Couldn't load breakdown.</p>
      </Card>
    );
  }

  const total = data.totalPotentialCents || 1;
  const slices = [
    {
      key: "paidEarly",
      icon: CheckCircle2,
      label: "Paid early (manager + admin approved)",
      cents: data.paidEarlyCents,
      count: data.paidEarlyItemCount,
      tone: "bg-emerald-500",
      text: "text-emerald-700",
      bg: "bg-emerald-50",
    },
    {
      key: "paidAfterInstall",
      icon: Clock,
      label: "Paid after installation",
      cents: data.paidAfterInstallCents,
      count: data.paidAfterInstallItemCount,
      tone: "bg-brand-500",
      text: "text-brand-700",
      bg: "bg-brand-50",
    },
    {
      key: "pendingEarly",
      icon: Hourglass,
      label: "Pending early-pay decision",
      cents: data.pendingEarlyCents,
      count: data.pendingItemCount,
      tone: "bg-amber-500",
      text: "text-amber-700",
      bg: "bg-amber-50",
    },
    {
      key: "deferred",
      icon: PauseCircle,
      label: "Deferred — paid only on install",
      cents: data.deferredCents,
      count: data.deferredItemCount,
      tone: "bg-slate-500",
      text: "text-slate-700",
      bg: "bg-slate-100",
    },
  ];

  return (
    <Card padding={false}>
      <div className="px-6 py-4 border-b border-slate-200 flex items-start gap-3">
        <div className="size-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white shrink-0">
          <Wallet className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">
            {title ?? "Potential commissions"}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            All approved contracts you have a stake in — paid, pending, or deferred.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Total potential
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatCents(data.totalPotentialCents)}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-3">
        {slices.map((s) => {
          const pct =
            data.totalPotentialCents > 0
              ? Math.round((s.cents / total) * 100)
              : 0;
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  <s.icon className={`size-4 ${s.text}`} />
                  <span className="text-slate-700">{s.label}</span>
                  {s.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.bg} ${s.text} font-semibold`}
                    >
                      {s.count}
                    </span>
                  )}
                </div>
                <div className={`${s.text} font-semibold tabular-nums`}>
                  {formatCents(s.cents)}
                </div>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full ${s.tone} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

        {data.totalPotentialCents === 0 && (
          <p className="text-sm text-slate-500 text-center py-4">
            No approved contracts yet — once you sign and the admin approves,
            potential commissions will show up here.
          </p>
        )}
      </div>

      <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600 rounded-b-xl">
        Early payment is opt-in: your area manager has to approve, then admin
        gives final sign-off. Either decline → commission is paid only after the
        installation is activated.
      </div>
    </Card>
  );
}
