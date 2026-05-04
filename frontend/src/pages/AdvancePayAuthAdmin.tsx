import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, ShieldAlert, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDateTime } from "../lib/format";
import { useRole } from "../store/auth";
import type {
  AdvancePayAuthorization,
  AdvanceAuthStatus,
} from "../lib/api-types";

// Per Review 1.2 (2026-05-04): role-aware tabs. Managers see only the queue
// awaiting their decision; admins see only the admin queue (manager-approved,
// awaiting final sign-off). Both can browse the audit history.
type Tab = {
  key: string;
  label: string;
  statuses: AdvanceAuthStatus[];
  helpFor: ("ADMIN" | "AREA_MANAGER")[];
};

const TABS: Tab[] = [
  {
    key: "manager",
    label: "Awaiting manager",
    statuses: ["PENDING", "PENDING_MANAGER"],
    helpFor: ["AREA_MANAGER", "ADMIN"],
  },
  {
    key: "admin",
    label: "Awaiting admin",
    statuses: ["PENDING_ADMIN"],
    helpFor: ["ADMIN"],
  },
  {
    key: "authorized",
    label: "Authorized",
    statuses: ["AUTHORIZED"],
    helpFor: ["ADMIN", "AREA_MANAGER"],
  },
  {
    key: "declined",
    label: "Declined",
    statuses: ["DECLINED", "DECLINED_BY_MANAGER", "DECLINED_BY_ADMIN"],
    helpFor: ["ADMIN", "AREA_MANAGER"],
  },
  {
    key: "resolved",
    label: "Resolved by install",
    statuses: ["RESOLVED_BY_INSTALL"],
    helpFor: ["ADMIN", "AREA_MANAGER"],
  },
];

function statusBadge(s: AdvanceAuthStatus) {
  const tone =
    s === "AUTHORIZED"
      ? "green"
      : s === "PENDING_MANAGER" || s === "PENDING"
        ? "amber"
        : s === "PENDING_ADMIN"
          ? "brand"
          : s === "DECLINED_BY_MANAGER" ||
              s === "DECLINED_BY_ADMIN" ||
              s === "DECLINED"
            ? "red"
            : "neutral";
  const label = s.toLowerCase().replace(/_/g, " ");
  return <Badge tone={tone}>{label}</Badge>;
}

export function AdvancePayAuthAdmin() {
  const role = useRole();
  const qc = useQueryClient();
  const [tabKey, setTabKey] = useState<string>(
    role === "AREA_MANAGER" ? "manager" : "admin"
  );

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !role || t.helpFor.includes(role as never)),
    [role]
  );
  const currentTab = visibleTabs.find((t) => t.key === tabKey) ?? visibleTabs[0];

  const { data: list = [], isLoading } = useQuery<AdvancePayAuthorization[]>({
    queryKey: ["advance-pay-authorizations", { tab: currentTab?.key }],
    queryFn: async () => {
      // Backend filters by single status; fetch each status in the tab + merge.
      if (!currentTab) return [];
      const all: AdvancePayAuthorization[] = [];
      for (const s of currentTab.statuses) {
        const { data } = await api.get<AdvancePayAuthorization[]>(
          "/advance-pay-authorizations",
          { params: { status: s } }
        );
        all.push(...data);
      }
      // De-dupe by _id (a record only matches one status, but be safe).
      const seen = new Set<string>();
      return all.filter((a) => {
        if (seen.has(a._id)) return false;
        seen.add(a._id);
        return true;
      });
    },
  });

  const decideManager = useMutation({
    mutationFn: async (input: {
      id: string;
      decision: "APPROVED" | "DECLINED";
      note: string;
    }) =>
      api.post(`/advance-pay-authorizations/${input.id}/decide-manager`, {
        decision: input.decision,
        note: input.note,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["advance-pay-authorizations"] }),
  });

  const decideAdmin = useMutation({
    mutationFn: async (input: {
      id: string;
      decision: "APPROVED" | "DECLINED";
      note: string;
    }) =>
      api.post(`/advance-pay-authorizations/${input.id}/decide-admin`, {
        decision: input.decision,
        note: input.note,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["advance-pay-authorizations"] }),
  });

  const decidingId =
    decideManager.isPending
      ? decideManager.variables?.id
      : decideAdmin.isPending
        ? decideAdmin.variables?.id
        : undefined;

  return (
    <div>
      <PageHeader
        title="Advance commission authorizations"
        description="Two-stage approval (Review 1.2): the area manager decides first, then the admin gives final sign-off. If either party declines, the agent's commission is paid only once installation is activated."
        action={
          <div className="flex flex-wrap gap-2">
            {visibleTabs.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={currentTab?.key === t.key ? "primary" : "outline"}
                onClick={() => setTabKey(t.key)}
              >
                {t.label}
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
            title={`Nothing in "${currentTab?.label ?? ""}"`}
            description="Once a contract is approved, the request appears in the manager queue. After the manager approves, it moves to the admin queue."
          />
        ) : (
          <Table>
            <THead>
              <Th>Contract</Th>
              <Th>Status</Th>
              <Th>Manager decision</Th>
              <Th>Admin decision</Th>
              <Th>Requested</Th>
              <Th align="right">Actions</Th>
            </THead>
            <TBody>
              {list.map((a) => {
                const isManagerStage =
                  a.status === "PENDING" || a.status === "PENDING_MANAGER";
                const isAdminStage = a.status === "PENDING_ADMIN";
                const canDecideManager =
                  isManagerStage &&
                  (role === "AREA_MANAGER" || role === "ADMIN");
                const canDecideAdmin = isAdminStage && role === "ADMIN";
                const busy = decidingId === a._id;

                return (
                  <Tr key={a._id}>
                    <Td>
                      <Link
                        to={`/contracts/${a.contractId}`}
                        className="text-brand-600 hover:underline"
                      >
                        <code className="text-xs font-mono">
                          {a.contractId.slice(-8)}
                        </code>
                      </Link>
                    </Td>
                    <Td>{statusBadge(a.status)}</Td>
                    <Td className="text-xs">
                      {a.managerDecidedAt ? (
                        <div>
                          <Badge
                            tone={a.managerDecision === "APPROVED" ? "green" : "red"}
                          >
                            {a.managerDecision}
                          </Badge>
                          <div className="text-slate-500 mt-0.5">
                            {formatDateTime(a.managerDecidedAt)}
                          </div>
                          {a.managerNote && (
                            <div className="text-slate-600 mt-0.5">
                              {a.managerNote}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">awaiting</span>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {a.adminDecidedAt ? (
                        <div>
                          <Badge
                            tone={a.adminDecision === "APPROVED" ? "green" : "red"}
                          >
                            {a.adminDecision}
                          </Badge>
                          <div className="text-slate-500 mt-0.5">
                            {formatDateTime(a.adminDecidedAt)}
                          </div>
                          {a.adminNote && (
                            <div className="text-slate-600 mt-0.5">
                              {a.adminNote}
                            </div>
                          )}
                        </div>
                      ) : a.managerDecision === "APPROVED" ? (
                        <span className="text-amber-600">awaiting</span>
                      ) : a.managerDecision === "DECLINED" ? (
                        <span className="text-slate-400">— skipped (manager declined)</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {formatDateTime(a.requestedAt)}
                    </Td>
                    <Td align="right">
                      {canDecideManager && (
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => {
                              const note =
                                window.prompt(
                                  "Note (optional). Approving sends this to admin for final sign-off; you take responsibility if installation later fails."
                                ) ?? "";
                              decideManager.mutate({
                                id: a._id,
                                decision: "APPROVED",
                                note,
                              });
                            }}
                            loading={busy && decideManager.isPending}
                            icon={<ArrowRight className="size-3.5" />}
                          >
                            Approve → admin
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const note =
                                window.prompt("Reason for decline (optional):") ?? "";
                              decideManager.mutate({
                                id: a._id,
                                decision: "DECLINED",
                                note,
                              });
                            }}
                            loading={busy && decideManager.isPending}
                            icon={<XCircle className="size-3.5" />}
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                      {canDecideAdmin && (
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => {
                              const note =
                                window.prompt(
                                  "Final sign-off note (optional). Approving pays the agent's commission immediately."
                                ) ?? "";
                              decideAdmin.mutate({
                                id: a._id,
                                decision: "APPROVED",
                                note,
                              });
                            }}
                            loading={busy && decideAdmin.isPending}
                            icon={<CheckCircle2 className="size-3.5" />}
                          >
                            Authorize early payment
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const note =
                                window.prompt("Reason for decline (optional):") ?? "";
                              decideAdmin.mutate({
                                id: a._id,
                                decision: "DECLINED",
                                note,
                              });
                            }}
                            loading={busy && decideAdmin.isPending}
                            icon={<XCircle className="size-3.5" />}
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                      {!canDecideManager && !canDecideAdmin && (
                        <span className="text-slate-400 text-xs">—</span>
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
