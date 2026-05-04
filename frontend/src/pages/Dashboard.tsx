import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Users as UsersIcon,
  FileSignature,
  Coins,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { CommissionBreakdownCard } from "../components/CommissionBreakdownCard";
import { formatCents, formatDate, currentPeriod } from "../lib/format";
import { useAuth, useRole, decodeUserId } from "../store/auth";
import { cn } from "../lib/cn";
import type {
  User,
  Contract,
  Customer,
  Notification,
  Solution,
  SolutionVersion,
  Payment,
} from "../lib/api-types";

type Funnel = Record<string, { count: number; totalCents: number }>;

export function Dashboard() {
  const role = useRole();
  const token = useAuth((s) => s.accessToken);
  const userId = decodeUserId(token);

  const { data: me } = useQuery<User>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/users/me")).data,
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["contracts"],
    queryFn: async () => (await api.get("/contracts")).data,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", ""],
    queryFn: async () => (await api.get("/customers")).data,
  });

  const { data: funnel } = useQuery<Funnel>({
    queryKey: ["report", "funnel"],
    queryFn: async () => (await api.get("/reports/pipeline-funnel")).data,
    enabled: role === "ADMIN" || role === "AREA_MANAGER",
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
    enabled: role === "ADMIN" || role === "AREA_MANAGER",
  });
  const userById = new Map(users.map((u) => [u._id, u]));

  const { data: solutions = [] } = useQuery<Solution[]>({
    queryKey: ["solutions"],
    queryFn: async () => (await api.get("/catalog/solutions")).data,
  });
  const solutionById = new Map(solutions.map((s) => [s._id, s]));

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications", "list"],
    queryFn: async () => (await api.get("/notifications")).data,
  });

  // Per Review 1.0 §6: dashboard tracks overdue + paid.
  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["payments"],
    queryFn: async () => (await api.get("/payments")).data,
  });

  const myContracts = contracts.filter((c) => (role === "AGENT" ? c.agentId === userId : true));
  const totalSigned = myContracts
    .filter((c) => c.status === "SIGNED")
    .reduce((acc, c) => acc + c.amountCents, 0);
  const signedCount = myContracts.filter((c) => c.status === "SIGNED").length;
  const draftCount = myContracts.filter((c) => c.status === "DRAFT").length;

  const myPayments =
    role === "AGENT" ? payments.filter((p) => p.userId === userId) : payments;
  const period = currentPeriod();
  const overdue = myPayments.filter(
    (p) => (p.status === "PENDING" || p.status === "PARTIAL") && p.period < period
  );
  const overdueAmount = overdue.reduce(
    (acc, p) => acc + (p.totalAmountCents - p.paidCents),
    0
  );
  const paidThisPeriod = myPayments
    .filter((p) => p.period === period && p.paidCents > 0)
    .reduce((acc, p) => acc + p.paidCents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {(me?.fullName ?? "").split(" ")[0] || "there"} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Period <span className="font-mono text-slate-700">{currentPeriod()}</span> · {role}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/customers/new">+ Customer</Link>
          </Button>
          <Button asChild>
            <Link to="/contracts/new">
              + New contract
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={UsersIcon} label="Customers" value={customers.length} link="/customers" tone="brand" />
        <StatTile icon={FileSignature} label="Contracts" value={myContracts.length} link="/contracts" tone="blue" />
        <StatTile icon={TrendingUp} label="Signed" value={signedCount} sub={formatCents(totalSigned)} tone="green" />
        <StatTile icon={Coins} label="Drafts" value={draftCount} link="/contracts" tone="amber" />
      </div>

      {(role === "ADMIN" || role === "AREA_MANAGER" || overdue.length > 0) && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <StatTile
            icon={AlertTriangle}
            label="Overdue payments"
            value={overdue.length}
            sub={overdue.length > 0 ? `${formatCents(overdueAmount)} unpaid` : "all clear"}
            link={role === "ADMIN" ? "/admin/payments" : undefined}
            tone={overdue.length > 0 ? "amber" : "green"}
          />
          <StatTile
            icon={CheckCircle2}
            label={`Paid this period (${period})`}
            value={formatCents(paidThisPeriod)}
            tone="green"
          />
          <StatTile
            icon={Coins}
            label="Pending payments"
            value={
              myPayments.filter((p) => p.status === "PENDING" || p.status === "PARTIAL").length
            }
            tone="blue"
          />
        </div>
      )}

      {/* Per Review 1.2 (2026-05-04): potential commissions breakdown — visible
          to anyone who has a stake in approved contracts (agents always; admins
          + AMs see their own row, viewing other people's is via Reports). */}
      <CommissionBreakdownCard />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card padding={false} className="lg:col-span-2 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold">Recent contracts</h3>
            <Link to="/contracts" className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          {myContracts.length === 0 ? (
            <EmptyState
              icon={FileSignature}
              title="No contracts yet"
              description="Start by creating a customer, then a contract for them."
              action={
                <Button asChild>
                  <Link to="/contracts/new">Create your first contract</Link>
                </Button>
              }
            />
          ) : (
            <RecentContractsTable
              contracts={myContracts.slice(0, 8)}
              userById={userById}
              solutionById={solutionById}
              showAgentColumn={role === "ADMIN" || role === "AREA_MANAGER"}
            />
          )}
        </Card>

        <Card padding={false} className="overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold">
              {role === "ADMIN" || role === "AREA_MANAGER" ? "Pipeline funnel" : "Notifications"}
            </h3>
          </div>
          {(role === "ADMIN" || role === "AREA_MANAGER") && funnel ? (
            <div className="p-4 space-y-2">
              {Object.entries(funnel).length === 0 ? (
                <p className="text-sm text-slate-500 px-2">No data yet.</p>
              ) : (
                Object.entries(funnel).map(([s, v]) => (
                  <div
                    key={s}
                    className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-slate-50"
                  >
                    <StatusBadge status={s} />
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-900">{v.count}</div>
                      <div className="text-xs text-slate-500">{formatCents(v.totalCents)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.slice(0, 5).map((n) => (
                <li key={n._id} className="px-6 py-3">
                  <div className="text-sm font-medium text-slate-900">{n.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{formatDate(n.createdAt)}</div>
                </li>
              ))}
              {notifications.length === 0 && (
                <li className="px-6 py-6 text-sm text-slate-500 text-center">No notifications.</li>
              )}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function RecentContractsTable({
  contracts,
  userById,
  solutionById,
  showAgentColumn,
}: {
  contracts: Contract[];
  userById: Map<string, User>;
  solutionById: Map<string, Solution>;
  showAgentColumn: boolean;
}) {
  // Fetch versions for any solution referenced by a contract — small N on the dashboard.
  const distinctSolutionIds = useMemo(
    () => Array.from(new Set(solutionById.keys())),
    [solutionById]
  );
  const { data: versionLookup } = useQuery<Map<string, string>>({
    queryKey: ["solution-versions-lookup", distinctSolutionIds.join(",")],
    queryFn: async () => {
      const map = new Map<string, string>();
      await Promise.all(
        distinctSolutionIds.map(async (sid) => {
          const versions = (
            await api.get<SolutionVersion[]>(`/catalog/solutions/${sid}/versions`)
          ).data;
          for (const v of versions) map.set(v._id, sid);
        })
      );
      return map;
    },
    enabled: distinctSolutionIds.length > 0,
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              Contract
            </th>
            {showAgentColumn && (
              <>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Agent
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Area Manager
                </th>
              </>
            )}
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              Solution
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
              Amount
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              Status
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {contracts.map((c) => {
            const agent = c.agentId ? userById.get(c.agentId) : undefined;
            const manager = c.managerId ? userById.get(c.managerId) : undefined;
            const solutionId = versionLookup?.get(c.solutionVersionId);
            const solution = solutionId ? solutionById.get(solutionId) : undefined;
            return (
              <tr key={c._id} className="hover:bg-slate-50 transition">
                <td className="px-4 py-2">
                  <Link
                    to={`/contracts/${c._id}`}
                    className="font-mono text-xs text-brand-600 hover:text-brand-700"
                  >
                    {c._id.slice(-8)}
                  </Link>
                </td>
                {showAgentColumn && (
                  <>
                    <td className="px-4 py-2 text-slate-700">
                      {agent?.fullName ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {manager?.fullName ?? <span className="text-slate-400">—</span>}
                    </td>
                  </>
                )}
                <td className="px-4 py-2 text-slate-700">
                  {solution?.name ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-2 text-right font-medium text-slate-900">
                  {formatCents(c.amountCents, c.currency)}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">
                  {formatDate(c.signedAt ?? c.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TILE_TONES = {
  brand: "bg-brand-50 text-brand-600",
  blue: "bg-sky-50 text-sky-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
};

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  link,
  tone,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string | number;
  sub?: string;
  link?: string;
  tone: keyof typeof TILE_TONES;
}) {
  const inner = (
    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-3xl font-bold text-slate-900 mt-2 tracking-tight">{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1.5">{sub}</div>}
        </div>
        <div className={cn("size-10 rounded-lg grid place-items-center", TILE_TONES[tone])}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
}
