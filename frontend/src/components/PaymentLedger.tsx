import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  RotateCcw,
  Filter,
  Calendar,
} from "lucide-react";
import { api } from "../lib/api";
import { Card, CardHeader } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "./ui/Table";
import { Field, Input, Select } from "./ui/Input";
import { Button } from "./ui/Button";
import { formatCents, formatDateTime } from "../lib/format";
import type { User } from "../lib/api-types";

type LedgerRow = {
  at: string;
  kind:
    | "commission_paid"
    | "commission_reversed"
    | "bonus_paid"
    | "bonus_reversed"
    | "payment_disbursed"
    | "payment_refunded";
  description: string;
  userId: string;
  contractId: string | null;
  period: string | null;
  amountCents: number;
  runningBalanceCents: number;
  reference: string | null;
};

type Summary = {
  totals: {
    earnedCents: number;
    reversedCents: number;
    disbursedCents: number;
    refundedCents: number;
    outstandingCents: number;
  };
  byUser: {
    userId: string;
    earnedCents: number;
    reversedCents: number;
    disbursedCents: number;
    refundedCents: number;
    outstandingCents: number;
  }[];
};

type Props = {
  isAdmin: boolean;
  users?: User[];
};

const KIND_META: Record<
  LedgerRow["kind"],
  { label: string; tone: "green" | "red" | "amber" | "brand" | "neutral"; sign: "+" | "−" }
> = {
  commission_paid: { label: "Commission", tone: "green", sign: "+" },
  bonus_paid: { label: "Bonus", tone: "brand", sign: "+" },
  commission_reversed: { label: "Commission reversed", tone: "red", sign: "−" },
  bonus_reversed: { label: "Bonus reversed", tone: "red", sign: "−" },
  payment_disbursed: { label: "Disbursed", tone: "amber", sign: "−" },
  payment_refunded: { label: "Refund returned", tone: "neutral", sign: "+" },
};

/**
 * Per Review 1.2 (2026-05-04) + Figma reference: a chronological ledger of
 * every financial event per user, with a per-user running balance updating
 * row-by-row. Top: a "current situation" summary tile.
 *
 * Filters: explicit user (admin only), period range (from/to), or a
 * comma-separated list of periods (multi-select). When no period filter is
 * applied the full history is returned.
 */
export function PaymentLedger({ isAdmin, users = [] }: Props) {
  const [filterUser, setFilterUser] = useState<string>("");
  const [fromPeriod, setFromPeriod] = useState<string>("");
  const [toPeriod, setToPeriod] = useState<string>("");
  const [pickedPeriods, setPickedPeriods] = useState<string[]>([]);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (filterUser) p.userId = filterUser;
    if (fromPeriod) p.fromPeriod = fromPeriod;
    if (toPeriod) p.toPeriod = toPeriod;
    if (pickedPeriods.length > 0) p.periods = pickedPeriods.join(",");
    return p;
  }, [filterUser, fromPeriod, toPeriod, pickedPeriods]);

  const { data: summary, isLoading: loadingSummary } = useQuery<Summary>({
    queryKey: ["payments-summary", { filterUser }],
    queryFn: async () =>
      (
        await api.get("/payments/summary", {
          params: filterUser ? { userId: filterUser } : {},
        })
      ).data,
  });

  const { data: rows = [], isLoading } = useQuery<LedgerRow[]>({
    queryKey: ["payments-ledger", params],
    queryFn: async () => (await api.get("/payments/ledger", { params })).data,
  });

  const userById = new Map(users.map((u) => [u._id, u]));

  // For period suggestions: distinct periods that exist in the user's history
  const knownPeriods = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.period && set.add(r.period));
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* ── Summary tile ──────────────────────────────────────── */}
      <Card>
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Wallet className="size-4" /> Current situation
          {filterUser && (
            <Badge tone="brand">
              {userById.get(filterUser)?.fullName ?? filterUser.slice(-6)}
            </Badge>
          )}
        </h3>
        {loadingSummary ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryStat
              label="Earned"
              icon={<TrendingUp className="size-4 text-emerald-700" />}
              value={summary?.totals.earnedCents ?? 0}
              tone="emerald"
            />
            <SummaryStat
              label="Reversed"
              icon={<RotateCcw className="size-4 text-red-700" />}
              value={summary?.totals.reversedCents ?? 0}
              tone="red"
              negative
            />
            <SummaryStat
              label="Disbursed"
              icon={<TrendingDown className="size-4 text-amber-700" />}
              value={summary?.totals.disbursedCents ?? 0}
              tone="amber"
              negative
            />
            <SummaryStat
              label="Refunded back"
              icon={<TrendingUp className="size-4 text-slate-700" />}
              value={summary?.totals.refundedCents ?? 0}
              tone="slate"
            />
            <SummaryStat
              label="Outstanding (owed)"
              icon={<Wallet className="size-4 text-brand-700" />}
              value={summary?.totals.outstandingCents ?? 0}
              tone="brand"
              emphasised
            />
          </div>
        )}
        {isAdmin && summary && summary.byUser.length > 1 && !filterUser && (
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Per-user breakdown
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200">
                    <th className="text-left py-1.5 pr-3">User</th>
                    <th className="text-right py-1.5 px-2">Earned</th>
                    <th className="text-right py-1.5 px-2">Reversed</th>
                    <th className="text-right py-1.5 px-2">Disbursed</th>
                    <th className="text-right py-1.5 pl-2">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byUser
                    .sort((a, b) => b.outstandingCents - a.outstandingCents)
                    .map((u) => (
                      <tr
                        key={u.userId}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-1.5 pr-3">
                          <button
                            type="button"
                            onClick={() => setFilterUser(u.userId)}
                            className="text-brand-600 hover:underline"
                          >
                            {userById.get(u.userId)?.fullName ?? u.userId.slice(-6)}
                          </button>
                        </td>
                        <td className="text-right py-1.5 px-2 text-emerald-700">
                          {formatCents(u.earnedCents, "EUR")}
                        </td>
                        <td className="text-right py-1.5 px-2 text-red-700">
                          {u.reversedCents > 0 ? "−" : ""}
                          {formatCents(u.reversedCents, "EUR")}
                        </td>
                        <td className="text-right py-1.5 px-2 text-amber-700">
                          {u.disbursedCents > 0 ? "−" : ""}
                          {formatCents(u.disbursedCents, "EUR")}
                        </td>
                        <td className="text-right py-1.5 pl-2 font-semibold text-brand-700">
                          {formatCents(u.outstandingCents, "EUR")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
          <Filter className="size-4" /> Filter the ledger
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {isAdmin && (
            <Field label="Beneficiary user">
              <Select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
              >
                <option value="">— Whole company —</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({u.role})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="From period (YYYY-MM)">
            <Input
              type="month"
              value={fromPeriod}
              onChange={(e) => setFromPeriod(e.target.value)}
              placeholder="full history"
            />
          </Field>
          <Field label="To period (YYYY-MM)">
            <Input
              type="month"
              value={toPeriod}
              onChange={(e) => setToPeriod(e.target.value)}
              placeholder="now"
            />
          </Field>
          <Field
            label="Or pick specific periods"
            hint="Click to toggle. Empty = all periods (filter overrides from/to)."
          >
            <div className="flex flex-wrap gap-1">
              {knownPeriods.map((p) => {
                const on = pickedPeriods.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() =>
                      setPickedPeriods((cur) =>
                        cur.includes(p)
                          ? cur.filter((x) => x !== p)
                          : [...cur, p]
                      )
                    }
                    className={`text-xs px-2 py-0.5 rounded-md border transition ${
                      on
                        ? "bg-brand-50 border-brand-300 text-brand-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <Calendar className="size-3 inline mr-0.5" />
                    {p}
                  </button>
                );
              })}
              {knownPeriods.length === 0 && (
                <span className="text-xs text-slate-400">no periods yet</span>
              )}
            </div>
          </Field>
        </div>
        {(fromPeriod || toPeriod || pickedPeriods.length > 0 || filterUser) && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFromPeriod("");
                setToPeriod("");
                setPickedPeriods([]);
                setFilterUser("");
              }}
            >
              Reset filters
            </Button>
          </div>
        )}
      </Card>

      {/* ── Ledger table ───────────────────────────────────────── */}
      <Card padding={false}>
        <CardHeader
          title={`Ledger (${rows.length} ${rows.length === 1 ? "entry" : "entries"})`}
        />
        {isLoading ? (
          <p className="px-6 py-8 text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-sm text-slate-500 text-center">
            No ledger entries match the current filters.
          </p>
        ) : (
          <Table>
            <THead>
              <Th>When</Th>
              <Th>Event</Th>
              <Th>Description</Th>
              {isAdmin && <Th>User</Th>}
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Running balance</Th>
            </THead>
            <TBody>
              {rows.map((r, i) => {
                const meta = KIND_META[r.kind];
                return (
                  <Tr key={`${r.reference}-${r.kind}-${i}`}>
                    <Td className="text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTime(r.at)}
                    </Td>
                    <Td>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {r.period && (
                        <span className="ml-2 text-xs text-slate-500">
                          {r.period}
                        </span>
                      )}
                    </Td>
                    <Td className="text-sm text-slate-700">
                      {r.description}
                      {r.contractId && (
                        <Link
                          to={`/contracts/${r.contractId}`}
                          className="ml-2 text-xs text-brand-600 hover:underline"
                        >
                          contract
                        </Link>
                      )}
                    </Td>
                    {isAdmin && (
                      <Td className="text-xs text-slate-600">
                        {userById.get(r.userId)?.fullName ?? r.userId.slice(-6)}
                      </Td>
                    )}
                    <Td
                      className={`text-right font-semibold whitespace-nowrap ${
                        r.amountCents >= 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {meta.sign} {formatCents(Math.abs(r.amountCents), "EUR")}
                    </Td>
                    <Td className="text-right font-mono text-sm whitespace-nowrap text-slate-700">
                      {formatCents(r.runningBalanceCents, "EUR")}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  icon,
  value,
  tone,
  negative = false,
  emphasised = false,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  tone: "emerald" | "red" | "amber" | "slate" | "brand";
  negative?: boolean;
  emphasised?: boolean;
}) {
  const toneCls: Record<typeof tone, string> = {
    emerald: "text-emerald-700",
    red: "text-red-700",
    amber: "text-amber-700",
    slate: "text-slate-700",
    brand: "text-brand-700",
  } as never;
  return (
    <div
      className={`rounded-lg border ${
        emphasised
          ? "border-brand-200 bg-brand-50/40"
          : "border-slate-200 bg-slate-50"
      } px-3 py-2.5`}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500">
        {icon} {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${toneCls[tone]} ${
          emphasised ? "text-xl" : ""
        }`}
      >
        {negative && value > 0 ? "−" : ""}
        {formatCents(value, "EUR")}
      </div>
    </div>
  );
}
