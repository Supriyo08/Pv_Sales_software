import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Sparkles, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { StatusBadge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDate } from "../lib/format";
import { useAuth, decodeUserId, useRole } from "../store/auth";
import { cn } from "../lib/cn";
import type { Customer, User } from "../lib/api-types";

type LeadStatus = "NEW" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";
const STAGES: LeadStatus[] = ["NEW", "QUALIFIED", "PROPOSAL", "WON", "LOST"];
const NEXT: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL", "LOST"],
  PROPOSAL: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

type Lead = {
  _id: string;
  customerId: string;
  agentId: string;
  source: string;
  status: LeadStatus;
  notes: string;
  createdAt: string;
};

export function Leads() {
  const qc = useQueryClient();
  const role = useRole();
  const token = useAuth((s) => s.accessToken);
  const userId = decodeUserId(token);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerId: "", agentId: userId ?? "", source: "" });
  const [error, setError] = useState<string | null>(null);

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: async () => (await api.get("/leads")).data,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", ""],
    queryFn: async () => (await api.get("/customers")).data,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
    enabled: role === "ADMIN" || role === "AREA_MANAGER",
  });
  const agents = users.filter((u) => u.role === "AGENT");

  const create = useMutation({
    mutationFn: async () =>
      api.post("/leads", {
        customerId: form.customerId,
        agentId: form.agentId,
        source: form.source,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      setShowForm(false);
      setForm({ ...form, customerId: "", source: "" });
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const transition = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) =>
      api.post(`/leads/${id}/transition`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  const customerById = new Map(customers.map((c) => [c._id, c]));
  const byStage = STAGES.reduce<Record<LeadStatus, Lead[]>>((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s);
    return acc;
  }, { NEW: [], QUALIFIED: [], PROPOSAL: [], WON: [], LOST: [] });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Pipeline view from new to won/lost. Move leads through stages."
        action={
          <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />}>
            New lead
          </Button>
        }
      />

      {showForm && (
        <Card>
          <h3 className="font-semibold mb-4">New lead</h3>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <Field label="Customer" required>
              <Select
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                required
              >
                <option value="">— Select —</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.fullName} ({c.fiscalCode})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Agent" required>
              <Select
                value={form.agentId}
                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                required
                disabled={role === "AGENT"}
              >
                {role === "AGENT" ? (
                  <option value={userId ?? ""}>You</option>
                ) : (
                  <>
                    <option value="">— Select —</option>
                    {agents.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.fullName}
                      </option>
                    ))}
                  </>
                )}
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Source" hint="e.g. website, referral, cold call">
                <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
              </Field>
            </div>
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => create.mutate()} loading={create.isPending}>
              Create lead
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {leads.length === 0 && !showForm && (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="No leads yet"
            description="Create your first lead to start tracking the sales pipeline."
            action={
              <Button onClick={() => setShowForm(true)} icon={<Plus className="size-4" />}>
                New lead
              </Button>
            }
          />
        </Card>
      )}

      {leads.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-5">
          {STAGES.map((stage) => (
            <div key={stage} className="bg-slate-100/60 rounded-xl p-3 flex flex-col">
              <div className="flex items-center justify-between mb-2 px-1">
                <StatusBadge status={stage} />
                <span className="text-xs text-slate-500 font-medium">{byStage[stage].length}</span>
              </div>
              <div className="space-y-2 flex-1 min-h-32">
                {byStage[stage].length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">Empty</p>
                )}
                {byStage[stage].map((lead) => {
                  const cust = customerById.get(lead.customerId);
                  return (
                    <div
                      key={lead._id}
                      className={cn(
                        "bg-white rounded-lg border border-slate-200 p-3 shadow-sm",
                        "hover:shadow-md hover:border-brand-200 transition"
                      )}
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {cust?.fullName ?? "Customer"}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{formatDate(lead.createdAt)}</div>
                      {lead.source && (
                        <div className="text-xs text-slate-600 mt-1">via {lead.source}</div>
                      )}
                      {NEXT[stage].length > 0 && (
                        <div className="flex gap-1 mt-2 pt-2 border-t border-slate-100">
                          {NEXT[stage].map((next) => (
                            <button
                              key={next}
                              onClick={() => transition.mutate({ id: lead._id, status: next })}
                              className="flex-1 text-[10px] font-medium px-1.5 py-1 rounded text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition flex items-center justify-center gap-0.5"
                              title={`Move to ${next}`}
                            >
                              {next}
                              <ArrowRight className="size-2.5" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
