import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, FileSearch as FileSearchIcon } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDateTime } from "../lib/format";
import type { ContractEditRequest } from "../lib/api-types";

const STATUS_OPTIONS: ContractEditRequest["status"][] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

export function ContractEditRequestsAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ContractEditRequest["status"]>("PENDING");

  const { data: requests = [], isLoading } = useQuery<ContractEditRequest[]>({
    queryKey: ["contract-edit-requests", { status }],
    queryFn: async () =>
      (await api.get("/contract-edit-requests", { params: { status } })).data,
  });

  const decide = useMutation({
    mutationFn: async (input: {
      id: string;
      action: "approve" | "reject";
      note: string;
    }) =>
      api.post(`/contract-edit-requests/${input.id}/${input.action}`, {
        note: input.note,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract-edit-requests"] }),
  });

  return (
    <div>
      <PageHeader
        title="Contracts to be approved"
        description="Agents request edits or generate new contract versions; admin or area manager reviews and approves before they take effect."
        action={
          <div className="flex gap-2">
            {STATUS_OPTIONS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "primary" : "outline"}
                onClick={() => setStatus(s)}
              >
                {s.toLowerCase()}
              </Button>
            ))}
          </div>
        }
      />

      <Card padding={false}>
        {isLoading ? (
          <p className="px-6 py-8 text-sm text-slate-500">Loading…</p>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={FileSearchIcon}
            title={`No ${status.toLowerCase()} requests`}
            description="When agents submit edits to existing contracts, they show up here for review."
          />
        ) : (
          <Table>
            <THead>
              <Th>Contract</Th>
              <Th>Status</Th>
              <Th>Changes</Th>
              <Th>Reason</Th>
              <Th>Submitted</Th>
              <Th>Decision</Th>
              <Th align="right">Actions</Th>
            </THead>
            <TBody>
              {requests.map((r) => (
                <Tr key={r._id}>
                  <Td>
                    <Link
                      to={`/contracts/${r.contractId}`}
                      className="text-brand-600 hover:underline"
                    >
                      <code className="text-xs font-mono">{r.contractId.slice(-8)}</code>
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td className="text-xs">
                    {Object.keys(r.changes).length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {Object.entries(r.changes).map(([k, v]) => (
                          <div key={k}>
                            <code className="font-mono text-[11px] text-slate-500">{k}</code>
                            : <span className="text-slate-900">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-600 max-w-xs">
                    {r.reason || <span className="text-slate-400">—</span>}
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</Td>
                  <Td className="text-xs">
                    {r.decidedAt ? (
                      <div>
                        <div>{formatDateTime(r.decidedAt)}</div>
                        {r.decisionNote && (
                          <div className="text-slate-500 mt-0.5">{r.decisionNote}</div>
                        )}
                      </div>
                    ) : (
                      <Badge tone="amber">awaiting</Badge>
                    )}
                  </Td>
                  <Td align="right">
                    {r.status === "PENDING" ? (
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          onClick={() =>
                            decide.mutate({
                              id: r._id,
                              action: "approve",
                              note: "approved from admin queue",
                            })
                          }
                          loading={decide.isPending && decide.variables?.id === r._id}
                          icon={<CheckCircle2 className="size-3.5" />}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const note = window.prompt("Reason for rejection?") ?? "";
                            decide.mutate({ id: r._id, action: "reject", note });
                          }}
                          loading={decide.isPending && decide.variables?.id === r._id}
                          icon={<XCircle className="size-3.5" />}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
