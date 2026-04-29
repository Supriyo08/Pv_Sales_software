import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Search, X } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDateTime } from "../lib/format";
import type { AuditLog, User } from "../lib/api-types";

const TARGET_TYPES = [
  "User",
  "Territory",
  "Solution",
  "SolutionVersion",
  "BonusRule",
  "Customer",
  "Lead",
  "Contract",
  "Installation",
  "Commission",
  "Payment",
  "BonusRun",
];

export function AuditLogs() {
  const [filters, setFilters] = useState({
    targetType: "",
    targetId: "",
    actorId: "",
    action: "",
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  const params: Record<string, string> = {};
  if (filters.targetType) params.targetType = filters.targetType;
  if (filters.targetId) params.targetId = filters.targetId;
  if (filters.actorId) params.actorId = filters.actorId;
  if (filters.action) params.action = filters.action;

  const { data, isLoading } = useQuery<{ items: AuditLog[]; nextCursor: string | null }>({
    queryKey: ["audit-logs", params],
    queryFn: async () => (await api.get("/audit-logs", { params })).data,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });
  const userById = new Map(users.map((u) => [u._id, u]));

  const items = data?.items ?? [];

  const reset = () =>
    setFilters({ targetType: "", targetId: "", actorId: "", action: "" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit logs"
        description="Append-only history of every change in the system."
      />

      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Entity type">
            <Select
              value={filters.targetType}
              onChange={(e) => setFilters({ ...filters, targetType: e.target.value })}
            >
              <option value="">All</option>
              {TARGET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entity ID">
            <Input
              value={filters.targetId}
              onChange={(e) => setFilters({ ...filters, targetId: e.target.value })}
              placeholder="ObjectId"
            />
          </Field>
          <Field label="Actor">
            <Select
              value={filters.actorId}
              onChange={(e) => setFilters({ ...filters, actorId: e.target.value })}
            >
              <option value="">All</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Action">
            <Input
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              placeholder="e.g. user.create"
            />
          </Field>
        </div>
        {(filters.targetType || filters.targetId || filters.actorId || filters.action) && (
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={reset} icon={<X className="size-3.5" />}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      <Card padding={false}>
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={History}
            title="No audit entries"
            description="Try adjusting filters or wait for activity to occur."
            action={<Button variant="outline" size="sm" onClick={reset} icon={<Search className="size-3.5" />}>Reset</Button>}
          />
        ) : (
          <Table>
            <THead>
              <Th>Timestamp</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>Actor</Th>
              <Th>Request ID</Th>
              <Th></Th>
            </THead>
            <TBody>
              {items.map((entry) => {
                const isExpanded = expanded === entry._id;
                return (
                  <>
                    <Tr key={entry._id} onClick={() => setExpanded(isExpanded ? null : entry._id)}>
                      <Td className="text-xs text-slate-500 whitespace-nowrap">
                        {formatDateTime(entry.createdAt)}
                      </Td>
                      <Td>
                        <Badge tone="brand">{entry.action}</Badge>
                      </Td>
                      <Td>
                        <div className="text-xs">
                          <div className="font-medium text-slate-900">{entry.targetType}</div>
                          <code className="font-mono text-slate-500">
                            {entry.targetId.slice(-12)}
                          </code>
                        </div>
                      </Td>
                      <Td className="text-sm">
                        {userById.get(entry.actorId)?.fullName ?? (
                          <code className="font-mono text-xs text-slate-500">
                            {entry.actorId.slice(-8)}
                          </code>
                        )}
                      </Td>
                      <Td>
                        {entry.requestId && (
                          <code className="font-mono text-[10px] text-slate-400">
                            {entry.requestId.slice(0, 8)}
                          </code>
                        )}
                      </Td>
                      <Td className="text-xs text-brand-600">
                        {isExpanded ? "Hide" : "View diff"}
                      </Td>
                    </Tr>
                    {isExpanded && (
                      <tr key={entry._id + "-diff"}>
                        <td colSpan={6} className="px-4 py-4 bg-slate-50 border-b border-slate-100">
                          <div className="grid lg:grid-cols-2 gap-4">
                            <DiffPane label="Before" value={entry.before} />
                            <DiffPane label="After" value={entry.after} />
                          </div>
                          {entry.metadata && (
                            <div className="mt-3">
                              <DiffPane label="Metadata" value={entry.metadata} />
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function DiffPane({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </div>
      <pre className="bg-white border border-slate-200 rounded-lg p-3 text-xs overflow-x-auto max-h-64">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
