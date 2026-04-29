import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Wallet, X } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents, formatDateTime, currentPeriod } from "../lib/format";
import type {
  Payment,
  PaymentTransaction,
  PaymentMethod,
  TransactionKind,
  User,
} from "../lib/api-types";

const KINDS: TransactionKind[] = ["PAY", "REFUND", "DISPUTE", "RESOLVE_DISPUTE"];
const METHODS: PaymentMethod[] = ["WIRE", "CASH", "CHECK", "CARD", "OTHER"];

export function Payments() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ userId: "", period: currentPeriod() });
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["payments"],
    queryFn: async () => (await api.get("/payments")).data,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });
  const userById = new Map(users.map((u) => [u._id, u]));

  const create = useMutation({
    mutationFn: async () => api.post("/payments", createForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      setShowCreate(false);
      setCreateForm({ userId: "", period: currentPeriod() });
      setCreateError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setCreateError(err?.response?.data?.error ?? "Failed"),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => api.post(`/payments/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Per-user, per-period payment records with full transaction history."
        action={
          !showCreate ? (
            <Button onClick={() => setShowCreate(true)} icon={<Plus className="size-4" />}>
              New payment
            </Button>
          ) : null
        }
      />

      {showCreate && (
        <Card>
          <h3 className="font-semibold mb-4">New payment</h3>
          <p className="text-sm text-slate-500 mb-4">
            Sums all active commissions for this user in the period (including bonuses) into a
            single payable record.
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <Field label="Beneficiary" required>
              <Select
                value={createForm.userId}
                onChange={(e) => setCreateForm({ ...createForm, userId: e.target.value })}
                required
              >
                <option value="">— Select —</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({u.role})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Period" required>
              <Input
                value={createForm.period}
                onChange={(e) => setCreateForm({ ...createForm, period: e.target.value })}
                placeholder="YYYY-MM"
                required
              />
            </Field>
          </div>
          {createError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => create.mutate()} loading={create.isPending}>
              Create payment
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <CardHeader title={`All payments (${payments.length})`} />
        {payments.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments yet" description="Create the first payable for a beneficiary period." />
        ) : (
          <Table>
            <THead>
              <Th>Beneficiary</Th>
              <Th>Period</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Paid</Th>
              <Th>Status</Th>
              <Th></Th>
            </THead>
            <TBody>
              {payments.map((p) => (
                <Tr key={p._id} onClick={() => setSelectedId(p._id === selectedId ? null : p._id)}>
                  <Td className="font-medium">
                    {userById.get(p.userId)?.fullName ?? <code className="font-mono text-xs">{p.userId.slice(-8)}</code>}
                  </Td>
                  <Td className="font-mono text-xs">{p.period}</Td>
                  <Td className="text-right font-semibold">{formatCents(p.totalAmountCents, p.currency)}</Td>
                  <Td className="text-right text-slate-600">{formatCents(p.paidCents, p.currency)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td className="text-xs text-brand-600">
                    {selectedId === p._id ? "Hide" : "Manage"}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {selectedId && (
        <PaymentDetailPanel
          paymentId={selectedId}
          onCancel={(id) => cancel.mutate(id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function PaymentDetailPanel({
  paymentId,
  onCancel,
  onClose,
}: {
  paymentId: string;
  onCancel: (id: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [showTxForm, setShowTxForm] = useState(false);
  const [tx, setTx] = useState({
    kind: "PAY" as TransactionKind,
    amountEuro: "",
    method: "" as PaymentMethod | "",
    referenceNumber: "",
    proofUrl: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: payment } = useQuery<Payment>({
    queryKey: ["payment", paymentId],
    queryFn: async () => (await api.get(`/payments/${paymentId}`)).data,
  });

  const { data: txs = [] } = useQuery<PaymentTransaction[]>({
    queryKey: ["payment-transactions", paymentId],
    queryFn: async () => (await api.get(`/payments/${paymentId}/transactions`)).data,
  });

  const addTx = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(parseFloat(tx.amountEuro) * 100);
      const body: Record<string, unknown> = {
        kind: tx.kind,
        amountCents,
      };
      if (tx.kind === "PAY" || tx.kind === "REFUND") {
        if (tx.method) body.method = tx.method;
        if (tx.referenceNumber) body.referenceNumber = tx.referenceNumber;
      }
      if (tx.proofUrl) body.proofUrl = tx.proofUrl;
      if (tx.notes) body.notes = tx.notes;
      return api.post(`/payments/${paymentId}/transactions`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment", paymentId] });
      qc.invalidateQueries({ queryKey: ["payment-transactions", paymentId] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      setShowTxForm(false);
      setTx({ kind: "PAY", amountEuro: "", method: "", referenceNumber: "", proofUrl: "", notes: "" });
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  if (!payment) return null;

  const isMoneyTx = tx.kind === "PAY" || tx.kind === "REFUND";

  return (
    <Card padding={false}>
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Payment <span className="font-mono text-xs text-slate-500">#{payment._id.slice(-8)}</span></h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {payment.period} · <StatusBadge status={payment.status} /> · {formatCents(payment.paidCents, payment.currency)} of{" "}
            {formatCents(payment.totalAmountCents, payment.currency)}
          </p>
        </div>
        <div className="flex gap-2">
          {!payment.cancelled && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (confirm("Cancel this payment?")) onCancel(paymentId);
              }}
            >
              Cancel payment
            </Button>
          )}
          {!showTxForm && (
            <Button size="sm" onClick={() => setShowTxForm(true)} icon={<Plus className="size-3.5" />}>
              New transaction
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {showTxForm && (
        <div className="bg-slate-50 border-b border-slate-200 p-6">
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <Field label="Kind" required>
              <Select
                value={tx.kind}
                onChange={(e) => setTx({ ...tx, kind: e.target.value as TransactionKind })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount (EUR)" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={tx.amountEuro}
                onChange={(e) => setTx({ ...tx, amountEuro: e.target.value })}
                required
              />
            </Field>
            {isMoneyTx && (
              <>
                <Field label="Method" hint="How the money moved">
                  <Select
                    value={tx.method}
                    onChange={(e) => setTx({ ...tx, method: e.target.value as PaymentMethod | "" })}
                  >
                    <option value="">— Not specified —</option>
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reference number" hint="Bank ref / external txn ID for reconciliation">
                  <Input
                    value={tx.referenceNumber}
                    onChange={(e) => setTx({ ...tx, referenceNumber: e.target.value })}
                  />
                </Field>
              </>
            )}
            <Field label="Proof URL" hint="Receipt / bank confirmation link">
              <Input
                type="url"
                value={tx.proofUrl}
                onChange={(e) => setTx({ ...tx, proofUrl: e.target.value })}
              />
            </Field>
            <Field label="Notes (admin)">
              <Input
                value={tx.notes}
                onChange={(e) => setTx({ ...tx, notes: e.target.value })}
              />
            </Field>
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => addTx.mutate()} loading={addTx.isPending}>
              Save transaction
            </Button>
            <Button variant="outline" onClick={() => setShowTxForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Table>
        <THead>
          <Th>When</Th>
          <Th>Kind</Th>
          <Th className="text-right">Amount</Th>
          <Th>Method</Th>
          <Th>Reference</Th>
          <Th>Proof</Th>
          <Th>Notes</Th>
        </THead>
        <TBody>
          {txs.length === 0 && (
            <Tr>
              <Td colSpan={7}>
                <span className="text-slate-500">No transactions yet.</span>
              </Td>
            </Tr>
          )}
          {txs.map((t) => (
            <Tr key={t._id}>
              <Td className="text-xs text-slate-500 whitespace-nowrap">
                {formatDateTime(t.executedAt)}
              </Td>
              <Td>
                <StatusBadge status={t.kind} />
              </Td>
              <Td className="text-right font-medium">{formatCents(t.amountCents)}</Td>
              <Td className="text-xs">
                {t.method ?? <span className="text-slate-400">—</span>}
              </Td>
              <Td>
                {t.referenceNumber ? (
                  <code className="font-mono text-xs">{t.referenceNumber}</code>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
              <Td>
                {t.proofUrl ? (
                  <a
                    href={t.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:text-brand-700 text-xs"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
              <Td className="text-xs text-slate-600 max-w-xs truncate">{t.notes || "—"}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
