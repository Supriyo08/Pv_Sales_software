import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Users as UsersIcon,
  FileSignature,
  Coins,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { api } from "../lib/api";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents, formatDate, currentPeriod } from "../lib/format";
import { useAuth, useRole, decodeUserId } from "../store/auth";
import { cn } from "../lib/cn";
import type { User, Contract, Customer, Notification } from "../lib/api-types";

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

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications", "list"],
    queryFn: async () => (await api.get("/notifications")).data,
  });

  const myContracts = contracts.filter((c) => (role === "AGENT" ? c.agentId === userId : true));
  const totalSigned = myContracts
    .filter((c) => c.status === "SIGNED")
    .reduce((acc, c) => acc + c.amountCents, 0);
  const signedCount = myContracts.filter((c) => c.status === "SIGNED").length;
  const draftCount = myContracts.filter((c) => c.status === "DRAFT").length;

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
            <ul className="divide-y divide-slate-100">
              {myContracts.slice(0, 6).map((c) => (
                <li key={c._id}>
                  <Link
                    to={`/contracts/${c._id}`}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex-1">
                      <div className="font-mono text-xs text-slate-500">{c._id.slice(-8)}</div>
                      <div className="text-sm font-medium text-slate-900 mt-0.5">
                        {formatCents(c.amountCents, c.currency)}
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                    <div className="text-xs text-slate-500 w-24 text-right">
                      {formatDate(c.signedAt ?? c.createdAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
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
