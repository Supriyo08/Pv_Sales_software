import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDateTime } from "../lib/format";
import type { AdvancePayAuthorization } from "../lib/api-types";

const STATUSES: AdvancePayAuthorization["status"][] = [
  "PENDING",
  "AUTHORIZED",
  "DECLINED",
  "RESOLVED_BY_INSTALL",
];

export function AdvancePayAuthAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AdvancePayAuthorization["status"]>("PENDING");

  const { data: list = [], isLoading } = useQuery<AdvancePayAuthorization[]>({
    queryKey: ["advance-pay-authorizations", { status }],
    queryFn: async () =>
      (await api.get("/advance-pay-authorizations", { params: { status } })).data,
  });

  const decide = useMutation({
    mutationFn: async (input: {
      id: string;
      decision: "AUTHORIZED" | "DECLINED";
      note: string;
    }) =>
      api.post(`/advance-pay-authorizations/${input.id}/decide`, {
        decision: input.decision,
        note: input.note,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["advance-pay-authorizations"] }),
  });

  return (
    <div>
      <PageHeader
        title="Advance commission authorizations"
        description="Per Review 1.1 §8: authorize early commission payment (you take responsibility for refund if installation later fails) — or decline to defer payment until installation is activated."
        action={
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "primary" : "outline"}
                onClick={() => setStatus(s)}
              >
                {s.toLowerCase().replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        }
      />

      <Card padding={false}>
        {isLoading ? (
          <p className="px-6 py-8 text-sm text-slate-500">Loading…</p>
        ) : list.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title={`No ${status.toLowerCase().replace(/_/g, " ")} authorizations`}
            description="When admin/AM approves a contract, the advance-pay authorization request appears here."
          />
        ) : (
          <Table>
            <THead>
              <Th>Contract</Th>
              <Th>Status</Th>
              <Th>Requested</Th>
              <Th>Decided</Th>
              <Th>Note</Th>
              <Th align="right">Actions</Th>
            </THead>
            <TBody>
              {list.map((a) => (
                <Tr key={a._id}>
                  <Td>
                    <Link
                      to={`/contracts/${a.contractId}`}
                      className="text-brand-600 hover:underline"
                    >
                      <code className="text-xs font-mono">{a.contractId.slice(-8)}</code>
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={a.status} />
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(a.requestedAt)}</Td>
                  <Td className="text-xs text-slate-500">
                    {a.decidedAt ? formatDateTime(a.decidedAt) : "—"}
                  </Td>
                  <Td className="text-xs text-slate-600 max-w-xs">
                    {a.note || <span className="text-slate-400">—</span>}
                  </Td>
                  <Td align="right">
                    {a.status === "PENDING" ? (
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => {
                            const note =
                              window.prompt(
                                "Note for authorization (optional — confirms you take responsibility for refund if install fails):"
                              ) ?? "";
                            decide.mutate({
                              id: a._id,
                              decision: "AUTHORIZED",
                              note,
                            });
                          }}
                          loading={decide.isPending && decide.variables?.id === a._id}
                          icon={<CheckCircle2 className="size-3.5" />}
                        >
                          Authorize
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const note =
                              window.prompt("Reason for decline (optional):") ?? "";
                            decide.mutate({ id: a._id, decision: "DECLINED", note });
                          }}
                          loading={decide.isPending && decide.variables?.id === a._id}
                          icon={<XCircle className="size-3.5" />}
                        >
                          Decline
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
