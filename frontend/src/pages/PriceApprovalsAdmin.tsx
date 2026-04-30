import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents, formatDateTime } from "../lib/format";
import type { PriceApprovalRequest, Customer, User } from "../lib/api-types";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export function PriceApprovalsAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof STATUSES)[number] | "">("PENDING");
  const [openDecision, setOpenDecision] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: requests = [] } = useQuery<PriceApprovalRequest[]>({
    queryKey: ["price-approvals", filter],
    queryFn: async () =>
      (await api.get("/price-approvals", { params: filter ? { status: filter } : {} })).data,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", ""],
    queryFn: async () => (await api.get("/customers")).data,
  });
  const customerById = new Map(customers.map((c) => [c._id, c]));

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });
  const userById = new Map(users.map((u) => [u._id, u]));

  const approve = useMutation({
    mutationFn: async (id: string) =>
      api.post(`/price-approvals/${id}/approve`, { decisionNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-approvals"] });
      setOpenDecision(null);
      setDecisionNote("");
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const reject = useMutation({
    mutationFn: async (id: string) =>
      api.post(`/price-approvals/${id}/reject`, { decisionNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-approvals"] });
      setOpenDecision(null);
      setDecisionNote("");
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Price approvals"
        description="Out-of-range contract amounts submitted by agents. Approving creates the contract; rejecting closes the request."
      />

      <Card>
        <Field label="Filter by status">
          <Select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as (typeof STATUSES)[number] | "")
            }
            className="max-w-xs"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card padding={false}>
        <CardHeader title={`${requests.length} request(s)`} />
        {requests.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="No requests"
            description="Out-of-range contract requests appear here for admin/area-manager decision."
          />
        ) : (
          <Table>
            <THead>
              <Th>Customer</Th>
              <Th>Agent</Th>
              <Th className="text-right">Requested</Th>
              <Th className="text-right">Range</Th>
              <Th>Note</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th></Th>
            </THead>
            <TBody>
              {requests.map((r) => {
                const cust = customerById.get(r.customerId);
                const ag = userById.get(r.agentId);
                const isOpen = openDecision === r._id;
                return (
                  <Tr key={r._id}>
                    <Td>{cust?.fullName ?? <code className="text-xs">{r.customerId.slice(-8)}</code>}</Td>
                    <Td>{ag?.fullName ?? <code className="text-xs">{r.agentId.slice(-8)}</code>}</Td>
                    <Td className="text-right font-semibold">
                      {formatCents(r.requestedAmountCents)}
                    </Td>
                    <Td className="text-right text-xs text-slate-600">
                      {r.minPriceCents !== null ? formatCents(r.minPriceCents) : "—"} →{" "}
                      {r.maxPriceCents !== null ? formatCents(r.maxPriceCents) : "—"}
                    </Td>
                    <Td className="text-xs text-slate-600 max-w-xs truncate">
                      {r.note || <span className="text-slate-400">—</span>}
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                      {r.contractId && (
                        <div className="mt-1">
                          <Link
                            to={`/contracts/${r.contractId}`}
                            className="text-xs text-brand-600 hover:text-brand-700"
                          >
                            View contract
                          </Link>
                        </div>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {formatDateTime(r.createdAt)}
                    </Td>
                    <Td>
                      {r.status === "PENDING" ? (
                        isOpen ? (
                          <div className="flex flex-col gap-2 min-w-48">
                            <Input
                              value={decisionNote}
                              onChange={(e) => setDecisionNote(e.target.value)}
                              placeholder="Decision note (optional)"
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={() => approve.mutate(r._id)}
                                loading={approve.isPending}
                                icon={<CheckCircle2 className="size-3.5" />}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => reject.mutate(r._id)}
                                loading={reject.isPending}
                                icon={<XCircle className="size-3.5" />}
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setOpenDecision(null);
                                  setDecisionNote("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                            {error && (
                              <div className="text-xs text-red-700">{error}</div>
                            )}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenDecision(r._id)}
                          >
                            Decide
                          </Button>
                        )
                      ) : (
                        <Badge tone="neutral">decided</Badge>
                      )}
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
