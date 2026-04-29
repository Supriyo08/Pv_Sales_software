import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { formatCents, currentPeriod } from "../lib/format";

type AgentRow = { userId: string; fullName: string; email: string; totalCents: number; count: number };
type NetworkRow = {
  managerId: string;
  fullName: string;
  email: string;
  agentCount: number;
  contractCount: number;
  contractAmountCents: number;
  activatedInstallations: number;
};
type Funnel = Record<string, { count: number; totalCents: number }>;
type PaymentSummary = Record<string, { count: number; totalCents: number }>;

export function Reports() {
  const [period, setPeriod] = useState("");

  const { data: agents = [] } = useQuery<AgentRow[]>({
    queryKey: ["report", "agent-earnings", period],
    queryFn: async () =>
      (await api.get("/reports/agent-earnings", { params: period ? { period } : {} })).data,
  });

  const { data: network = [] } = useQuery<NetworkRow[]>({
    queryKey: ["report", "network"],
    queryFn: async () => (await api.get("/reports/network-performance")).data,
  });

  const { data: funnel = {} } = useQuery<Funnel>({
    queryKey: ["report", "funnel"],
    queryFn: async () => (await api.get("/reports/pipeline-funnel")).data,
  });

  const { data: payments = {} } = useQuery<PaymentSummary>({
    queryKey: ["report", "payments"],
    queryFn: async () => (await api.get("/reports/payment-summary")).data,
  });

  const downloadCsv = async (path: string, filename: string) => {
    const res = await api.get(path, {
      params: { format: "csv", ...(period ? { period } : {}) },
      responseType: "blob",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(res.data);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Aggregated views across the sales pipeline." />

      <Card className="flex flex-wrap items-end gap-3">
        <Field label="Period filter (YYYY-MM)">
          <Input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder={currentPeriod()}
            className="w-40"
          />
        </Field>
        {period && (
          <Button variant="outline" size="sm" onClick={() => setPeriod("")} icon={<X className="size-3.5" />}>
            Clear
          </Button>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding={false}>
          <CardHeader title="Pipeline funnel" description="Contracts grouped by status" />
          <Table>
            <TBody>
              {Object.entries(funnel).length === 0 && (
                <Tr>
                  <Td colSpan={3}>
                    <span className="text-slate-500">No data yet.</span>
                  </Td>
                </Tr>
              )}
              {Object.entries(funnel).map(([s, v]) => (
                <Tr key={s}>
                  <Td>
                    <StatusBadge status={s} />
                  </Td>
                  <Td className="text-slate-600">{v.count} contracts</Td>
                  <Td className="font-medium">{formatCents(v.totalCents)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card padding={false}>
          <CardHeader title="Payments" description="Status breakdown" />
          <Table>
            <TBody>
              {Object.entries(payments).length === 0 && (
                <Tr>
                  <Td colSpan={3}>
                    <span className="text-slate-500">No payments yet.</span>
                  </Td>
                </Tr>
              )}
              {Object.entries(payments).map(([s, v]) => (
                <Tr key={s}>
                  <Td>
                    <StatusBadge status={s} />
                  </Td>
                  <Td className="text-slate-600">{v.count} payments</Td>
                  <Td className="font-medium">{formatCents(v.totalCents)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card padding={false}>
        <CardHeader
          title={`Agent earnings${period ? " · " + period : ""}`}
          description="Active commissions summed per agent"
          action={
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="size-3.5" />}
              onClick={() => downloadCsv("/reports/agent-earnings", `agent-earnings${period ? "-" + period : ""}.csv`)}
            >
              Export CSV
            </Button>
          }
        />
        <Table>
          <THead>
            <Th>Agent</Th>
            <Th>Email</Th>
            <Th className="text-right">Commissions</Th>
            <Th className="text-right">Total</Th>
          </THead>
          <TBody>
            {agents.length === 0 && (
              <Tr>
                <Td colSpan={4}>
                  <span className="text-slate-500">No commissions yet.</span>
                </Td>
              </Tr>
            )}
            {agents.map((a) => (
              <Tr key={a.userId}>
                <Td className="font-medium">{a.fullName ?? "—"}</Td>
                <Td className="text-slate-600">{a.email}</Td>
                <Td className="text-right">{a.count}</Td>
                <Td className="text-right font-semibold">{formatCents(a.totalCents)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card padding={false}>
        <CardHeader
          title="Network performance"
          description="Per area manager — agents, contracts, activations"
          action={
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="size-3.5" />}
              onClick={() => downloadCsv("/reports/network-performance", "network-performance.csv")}
            >
              Export CSV
            </Button>
          }
        />
        <Table>
          <THead>
            <Th>Area Manager</Th>
            <Th className="text-right">Agents</Th>
            <Th className="text-right">Contracts</Th>
            <Th className="text-right">Activated</Th>
            <Th className="text-right">Contract value</Th>
          </THead>
          <TBody>
            {network.length === 0 && (
              <Tr>
                <Td colSpan={5}>
                  <span className="text-slate-500">No data yet.</span>
                </Td>
              </Tr>
            )}
            {network.map((n) => (
              <Tr key={n.managerId}>
                <Td className="font-medium">{n.fullName}</Td>
                <Td className="text-right">{n.agentCount}</Td>
                <Td className="text-right">{n.contractCount}</Td>
                <Td className="text-right">{n.activatedInstallations}</Td>
                <Td className="text-right font-semibold">{formatCents(n.contractAmountCents)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
