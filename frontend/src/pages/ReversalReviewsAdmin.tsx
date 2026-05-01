import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MinusCircle, RotateCcw, AlertOctagon } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents, formatDateTime } from "../lib/format";
import type { ReversalReview } from "../lib/api-types";

const STATUSES: ReversalReview["status"][] = ["PENDING", "DECIDED"];

export function ReversalReviewsAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReversalReview["status"]>("PENDING");

  const { data: list = [], isLoading } = useQuery<ReversalReview[]>({
    queryKey: ["reversal-reviews", { status }],
    queryFn: async () => (await api.get("/reversal-reviews", { params: { status } })).data,
  });

  const decide = useMutation({
    mutationFn: async (input: {
      id: string;
      decision: "KEEP" | "REVERT" | "REDUCE";
      reduceCents?: number | null;
      note: string;
    }) =>
      api.post(`/reversal-reviews/${input.id}/decide`, {
        decision: input.decision,
        reduceCents: input.reduceCents,
        note: input.note,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reversal-reviews"] }),
  });

  return (
    <div>
      <PageHeader
        title="Reversal reviews"
        description="Per Review 1.1 §7: when an installation backing a paid commission or bonus is cancelled, admin decides what happens — keep, revert, or reduce. Never automatic."
        action={
          <div className="flex gap-2">
            {STATUSES.map((s) => (
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
        ) : list.length === 0 ? (
          <EmptyState
            icon={AlertOctagon}
            title={`No ${status.toLowerCase()} reviews`}
            description="When an installation is cancelled, all affected commissions and bonuses appear here for admin decision."
          />
        ) : (
          <Table>
            <THead>
              <Th>Kind</Th>
              <Th>Beneficiary</Th>
              <Th>Period</Th>
              <Th>Amount</Th>
              <Th>Contract</Th>
              <Th>Created</Th>
              <Th>Decision</Th>
              <Th align="right">Actions</Th>
            </THead>
            <TBody>
              {list.map((r) => (
                <Tr key={r._id}>
                  <Td>
                    <Badge tone={r.kind === "COMMISSION" ? "brand" : "amber"}>{r.kind}</Badge>
                  </Td>
                  <Td>
                    <code className="text-xs font-mono">
                      {r.beneficiaryUserId.slice(-8)}
                    </code>
                  </Td>
                  <Td className="text-xs">{r.period ?? "—"}</Td>
                  <Td className="font-semibold">
                    {formatCents(r.amountCents, r.currency)}
                  </Td>
                  <Td>
                    <Link
                      to={`/contracts/${r.contractId}`}
                      className="text-brand-600 hover:underline"
                    >
                      <code className="text-xs font-mono">{r.contractId.slice(-8)}</code>
                    </Link>
                  </Td>
                  <Td className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</Td>
                  <Td className="text-xs">
                    {r.decision ? (
                      <div>
                        <Badge
                          tone={
                            r.decision === "KEEP"
                              ? "neutral"
                              : r.decision === "REVERT"
                                ? "red"
                                : "amber"
                          }
                        >
                          {r.decision}
                        </Badge>
                        {r.decision === "REDUCE" && r.reduceCents !== null && (
                          <div className="text-slate-500 mt-1">
                            → {formatCents(r.reduceCents, r.currency)}
                          </div>
                        )}
                        {r.decisionNote && (
                          <div className="text-slate-500 mt-1">{r.decisionNote}</div>
                        )}
                      </div>
                    ) : (
                      <Badge tone="amber">awaiting</Badge>
                    )}
                  </Td>
                  <Td align="right">
                    {r.status === "PENDING" ? (
                      <div className="inline-flex gap-1 flex-wrap justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const note =
                              window.prompt("Note (e.g. AM authorized advance):") ?? "";
                            decide.mutate({ id: r._id, decision: "KEEP", note });
                          }}
                          loading={decide.isPending && decide.variables?.id === r._id}
                          icon={<CheckCircle2 className="size-3.5" />}
                        >
                          Keep
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const cents = window.prompt(
                              `Reduce to (cents, < ${r.amountCents}):`,
                              String(Math.round(r.amountCents / 2))
                            );
                            if (!cents) return;
                            const reduceCents = parseInt(cents, 10);
                            if (isNaN(reduceCents)) return;
                            const note =
                              window.prompt("Note for reduction:") ?? "";
                            decide.mutate({
                              id: r._id,
                              decision: "REDUCE",
                              reduceCents,
                              note,
                            });
                          }}
                          loading={decide.isPending && decide.variables?.id === r._id}
                          icon={<MinusCircle className="size-3.5" />}
                        >
                          Reduce
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (
                              !confirm(
                                `Revert ${r.kind.toLowerCase()} of ${formatCents(r.amountCents, r.currency)}? The beneficiary owes a refund.`
                              )
                            )
                              return;
                            const note =
                              window.prompt("Reason for revert:") ?? "";
                            decide.mutate({ id: r._id, decision: "REVERT", note });
                          }}
                          loading={decide.isPending && decide.variables?.id === r._id}
                          icon={<RotateCcw className="size-3.5" />}
                        >
                          Revert
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
