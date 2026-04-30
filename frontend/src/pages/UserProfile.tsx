import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Wallet, Trophy, FileSignature } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents, formatDate } from "../lib/format";
import type { User, Contract, Payment } from "../lib/api-types";

type ProfileResponse = {
  user: User;
  contractsByStatus: { _id: string; count: number; totalCents: number }[];
  activeCommissions: { _id: string; total: number; count: number }[];
  bonusesByPeriod: {
    _id: string;
    bonusCents: number;
    baseCents: number;
    count: number;
  }[];
  paymentsByStatus: {
    _id: string;
    count: number;
    totalCents: number;
    paidCents: number;
  }[];
  recentContracts: Contract[];
  recentPayments: Payment[];
};

export function UserProfile() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: ["user-profile", id],
    queryFn: async () => (await api.get(`/users/${id}/profile`)).data,
    enabled: !!id,
  });

  if (isLoading || !data) {
    return <p className="text-slate-500">Loading…</p>;
  }

  const { user, contractsByStatus, activeCommissions, bonusesByPeriod, paymentsByStatus, recentContracts, recentPayments } = data;

  const totalCommissionCents = activeCommissions.reduce((acc, r) => acc + r.total, 0);
  const totalBonusCents = bonusesByPeriod.reduce((acc, r) => acc + r.bonusCents, 0);
  const totalContracts = contractsByStatus.reduce((acc, r) => acc + r.count, 0);
  const totalPaidCents = paymentsByStatus.reduce((acc, r) => acc + r.paidCents, 0);

  return (
    <div>
      <BackLink to="/admin/users">Back to users</BackLink>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={user.fullName} size="md" />
            <span>{user.fullName}</span>
            <StatusBadge status={user.role} />
          </span>
        }
        description={user.email}
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={FileSignature} label="Total contracts" value={totalContracts} tone="brand" />
        <StatTile
          icon={TrendingUp}
          label="Active commissions"
          value={formatCents(totalCommissionCents)}
          sub={`${activeCommissions.reduce((a, r) => a + r.count, 0)} rows`}
          tone="green"
        />
        <StatTile
          icon={Trophy}
          label="Bonuses earned"
          value={formatCents(totalBonusCents)}
          sub={`${bonusesByPeriod.length} periods`}
          tone="amber"
        />
        <StatTile
          icon={Wallet}
          label="Paid out"
          value={formatCents(totalPaidCents)}
          sub={`${paymentsByStatus.reduce((a, r) => a + r.count, 0)} payments`}
          tone="blue"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <Card padding={false}>
          <CardHeader title="Contracts by status" />
          {contractsByStatus.length === 0 ? (
            <EmptyState
              icon={FileSignature}
              title="No contracts"
              description="This user hasn't been assigned to any contracts yet."
            />
          ) : (
            <Table>
              <THead>
                <Th>Status</Th>
                <Th className="text-right">Count</Th>
                <Th className="text-right">Total value</Th>
              </THead>
              <TBody>
                {contractsByStatus.map((r) => (
                  <Tr key={r._id}>
                    <Td>
                      <StatusBadge status={r._id} />
                    </Td>
                    <Td className="text-right font-medium">{r.count}</Td>
                    <Td className="text-right">{formatCents(r.totalCents)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card padding={false}>
          <CardHeader
            title="Active commissions by source"
            description="Excludes superseded rows"
          />
          {activeCommissions.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No active commissions"
              description="No commissions have been generated for this user yet."
            />
          ) : (
            <Table>
              <THead>
                <Th>Source event</Th>
                <Th className="text-right">Count</Th>
                <Th className="text-right">Total</Th>
              </THead>
              <TBody>
                {activeCommissions.map((r) => (
                  <Tr key={r._id}>
                    <Td className="text-xs font-mono text-slate-700">{r._id}</Td>
                    <Td className="text-right">{r.count}</Td>
                    <Td className="text-right font-semibold">{formatCents(r.total)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card padding={false}>
          <CardHeader title="Payments by status" />
          {paymentsByStatus.length === 0 ? (
            <EmptyState icon={Wallet} title="No payments" />
          ) : (
            <Table>
              <THead>
                <Th>Status</Th>
                <Th className="text-right">Count</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Paid</Th>
              </THead>
              <TBody>
                {paymentsByStatus.map((r) => (
                  <Tr key={r._id}>
                    <Td>
                      <StatusBadge status={r._id} />
                    </Td>
                    <Td className="text-right">{r.count}</Td>
                    <Td className="text-right">{formatCents(r.totalCents)}</Td>
                    <Td className="text-right font-medium">{formatCents(r.paidCents)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card padding={false}>
          <CardHeader title="Bonuses by period" description="Most recent first" />
          {bonusesByPeriod.length === 0 ? (
            <EmptyState icon={Trophy} title="No bonuses earned yet" />
          ) : (
            <Table>
              <THead>
                <Th>Period</Th>
                <Th className="text-right">Rules hit</Th>
                <Th className="text-right">Base</Th>
                <Th className="text-right">Bonus</Th>
              </THead>
              <TBody>
                {bonusesByPeriod.map((r) => (
                  <Tr key={r._id}>
                    <Td className="font-mono text-xs">{r._id}</Td>
                    <Td className="text-right">{r.count}</Td>
                    <Td className="text-right">{formatCents(r.baseCents)}</Td>
                    <Td className="text-right font-semibold text-emerald-700">
                      {formatCents(r.bonusCents)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <Card padding={false}>
          <CardHeader
            title="Recent contracts"
            description={`Showing ${recentContracts.length} most recent`}
          />
          {recentContracts.length === 0 ? (
            <EmptyState icon={FileSignature} title="No contracts yet" />
          ) : (
            <Table>
              <THead>
                <Th>ID</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th className="text-right">Signed</Th>
              </THead>
              <TBody>
                {recentContracts.map((c) => (
                  <Tr key={c._id}>
                    <Td>
                      <Link
                        to={`/contracts/${c._id}`}
                        className="font-mono text-xs text-brand-600 hover:text-brand-700"
                      >
                        {c._id.slice(-8)}
                      </Link>
                    </Td>
                    <Td className="text-right font-medium">
                      {formatCents(c.amountCents, c.currency)}
                    </Td>
                    <Td>
                      <StatusBadge status={c.status} />
                    </Td>
                    <Td className="text-right text-xs text-slate-500">
                      {formatDate(c.signedAt ?? c.createdAt)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card padding={false}>
          <CardHeader title="Recent payments" />
          {recentPayments.length === 0 ? (
            <EmptyState icon={Wallet} title="No payments yet" />
          ) : (
            <Table>
              <THead>
                <Th>Period</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Paid</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {recentPayments.map((p) => (
                  <Tr key={p._id}>
                    <Td className="font-mono text-xs">{p.period}</Td>
                    <Td className="text-right">{formatCents(p.totalAmountCents)}</Td>
                    <Td className="text-right font-medium">{formatCents(p.paidCents)}</Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="font-semibold mb-3">Hierarchy</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Field label="Email">{user.email}</Field>
          <Field label="Role">
            <StatusBadge status={user.role} />
          </Field>
          <Field label="Manager">
            {user.managerId ? (
              <code className="font-mono text-xs">{user.managerId.slice(-8)}</code>
            ) : (
              <Badge tone="neutral">none</Badge>
            )}
          </Field>
          <Field label="Territory">
            {user.territoryId ? (
              <code className="font-mono text-xs">{user.territoryId.slice(-8)}</code>
            ) : (
              <Badge tone="neutral">none</Badge>
            )}
          </Field>
          <Field label="Joined">{formatDate(user.createdAt)}</Field>
        </div>
      </Card>
    </div>
  );
}

const TILE_TONES = {
  brand: "bg-brand-50 text-brand-600",
  blue: "bg-sky-50 text-sky-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
} as const;

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string | number;
  sub?: string;
  tone: keyof typeof TILE_TONES;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">{value}</div>
          {sub && <div className="text-xs text-slate-500 mt-1.5">{sub}</div>}
        </div>
        <div className={`size-10 rounded-lg grid place-items-center ${TILE_TONES[tone]}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-slate-900">{children}</div>
    </div>
  );
}
