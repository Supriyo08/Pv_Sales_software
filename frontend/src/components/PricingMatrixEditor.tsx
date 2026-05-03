import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, RotateCcw, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "./ui/Button";
import { Input, Select } from "./ui/Input";
import { Badge } from "./ui/Badge";
import type {
  InstallmentPlan,
  SolutionPricingMatrixRow,
  SolutionVersion,
} from "../lib/api-types";

type Props = {
  solutionId: string;
  version: SolutionVersion;
  plans: InstallmentPlan[];
  canEdit: boolean;
};

type DraftRow = SolutionPricingMatrixRow & { tempId: string };

/**
 * Per Review 1.2 (2026-05-04) + Figma reference: a single inline editor for
 * the (paymentMethod × installmentPlan × advance-range) pricing matrix on a
 * solution version. Each row overrides the version defaults; empty cells fall
 * back to the version's basePriceCents / agentBp / managerBp.
 *
 * Each numeric column has two input modes:
 *   - cents/bp:  absolute amount (e.g. €10,500 → 1050000 cents, 15% → 1500 bp)
 *   - pct:       percentage of base (e.g. 95 → 95% of basePriceCents)
 *
 * The toggle is per-cell so admins can mix-and-match (final price as % of
 * base, agent commission as a flat 15%, manager commission as 5%, etc.).
 */
export function PricingMatrixEditor({
  solutionId,
  version,
  plans,
  canEdit,
}: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [dirty, setDirty] = useState(false);

  // Reset the draft state whenever the version's matrix changes from the server.
  useEffect(() => {
    const next = (version.pricingMatrix ?? []).map((r, i) => ({
      ...r,
      tempId: `srv-${i}-${r._id ?? Math.random()}`,
    }));
    setRows(next);
    setDirty(false);
  }, [version._id, version.pricingMatrix]);

  const save = useMutation({
    mutationFn: async () => {
      const clean: SolutionPricingMatrixRow[] = rows.map((r) => {
        // Strip the tempId from the payload; everything else passes through
        // unchanged so the server can store / null out cleanly.
        const { tempId: _t, _id: _i, ...rest } = r;
        void _t;
        void _i;
        return rest;
      });
      return api.patch(
        `/catalog/solutions/${solutionId}/versions/${version._id}`,
        { pricingMatrix: clean }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["solution-versions", solutionId] });
      setDirty(false);
    },
  });

  const grouped = useMemo(() => {
    return {
      ONE_TIME: rows.filter((r) => r.paymentMethod === "ONE_TIME"),
      ADVANCE_INSTALLMENTS: rows.filter(
        (r) => r.paymentMethod === "ADVANCE_INSTALLMENTS"
      ),
      FULL_INSTALLMENTS: rows.filter((r) => r.paymentMethod === "FULL_INSTALLMENTS"),
    };
  }, [rows]);

  const addRow = (
    paymentMethod: SolutionPricingMatrixRow["paymentMethod"]
  ) => {
    const tempId = `new-${Date.now()}-${Math.random()}`;
    setRows((cur) => [
      ...cur,
      {
        tempId,
        paymentMethod,
        installmentPlanId: paymentMethod === "ONE_TIME" ? null : null,
        advanceMinCents:
          paymentMethod === "ADVANCE_INSTALLMENTS" ? null : null,
        advanceMaxCents:
          paymentMethod === "ADVANCE_INSTALLMENTS" ? null : null,
        finalPriceCents: null,
        finalPricePct: null,
        agentBp: null,
        agentPct: null,
        managerBp: null,
        managerPct: null,
        label: "",
      },
    ]);
    setDirty(true);
  };

  const updateRow = (tempId: string, patch: Partial<DraftRow>) => {
    setRows((cur) => cur.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const removeRow = (tempId: string) => {
    setRows((cur) => cur.filter((r) => r.tempId !== tempId));
    setDirty(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500 max-w-2xl">
          Each row overrides the version's defaults (base price{" "}
          <strong>
            {(version.basePriceCents / 100).toFixed(2)} {version.currency}
          </strong>
          , agent {version.agentBp / 100}%, manager {version.managerBp / 100}%)
          for a specific payment method × installment plan × advance range.
          Toggle each cell between an absolute amount and a percentage of the base.
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = (version.pricingMatrix ?? []).map((r, i) => ({
                  ...r,
                  tempId: `srv-${i}-${r._id ?? Math.random()}`,
                }));
                setRows(next);
                setDirty(false);
              }}
              disabled={!dirty}
              icon={<RotateCcw className="size-3.5" />}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              loading={save.isPending}
              disabled={!dirty}
              icon={<Save className="size-3.5" />}
            >
              Save matrix
            </Button>
          </div>
        )}
      </div>

      <Group
        title="Full payment"
        accent="brand"
        rows={grouped.ONE_TIME}
        onAdd={canEdit ? () => addRow("ONE_TIME") : undefined}
        plans={plans}
        version={version}
        canEdit={canEdit}
        updateRow={updateRow}
        removeRow={removeRow}
        showPlan={false}
        showAdvance={false}
      />
      <Group
        title="Advance + installment"
        accent="amber"
        rows={grouped.ADVANCE_INSTALLMENTS}
        onAdd={canEdit ? () => addRow("ADVANCE_INSTALLMENTS") : undefined}
        plans={plans}
        version={version}
        canEdit={canEdit}
        updateRow={updateRow}
        removeRow={removeRow}
        showPlan
        showAdvance
      />
      <Group
        title="Full installment"
        accent="green"
        rows={grouped.FULL_INSTALLMENTS}
        onAdd={canEdit ? () => addRow("FULL_INSTALLMENTS") : undefined}
        plans={plans}
        version={version}
        canEdit={canEdit}
        updateRow={updateRow}
        removeRow={removeRow}
        showPlan
        showAdvance={false}
      />
    </div>
  );
}

const ACCENT: Record<string, string> = {
  brand: "border-brand-200 bg-brand-50/30",
  amber: "border-amber-200 bg-amber-50/40",
  green: "border-emerald-200 bg-emerald-50/40",
};

function Group({
  title,
  accent,
  rows,
  onAdd,
  plans,
  version,
  canEdit,
  updateRow,
  removeRow,
  showPlan,
  showAdvance,
}: {
  title: string;
  accent: string;
  rows: DraftRow[];
  onAdd?: () => void;
  plans: InstallmentPlan[];
  version: SolutionVersion;
  canEdit: boolean;
  updateRow: (id: string, patch: Partial<DraftRow>) => void;
  removeRow: (id: string) => void;
  showPlan: boolean;
  showAdvance: boolean;
}) {
  return (
    <div className={`rounded-lg border ${ACCENT[accent] ?? ""} p-3`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          {title}
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
          >
            <Plus className="size-3" /> Add row
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-500 italic">
          No overrides — uses version defaults.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Row
              key={r.tempId}
              row={r}
              plans={plans}
              version={version}
              canEdit={canEdit}
              onChange={(p) => updateRow(r.tempId, p)}
              onRemove={() => removeRow(r.tempId)}
              showPlan={showPlan}
              showAdvance={showAdvance}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  plans,
  version,
  canEdit,
  onChange,
  onRemove,
  showPlan,
  showAdvance,
}: {
  row: DraftRow;
  plans: InstallmentPlan[];
  version: SolutionVersion;
  canEdit: boolean;
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
  showPlan: boolean;
  showAdvance: boolean;
}) {
  // Resolve effective values for the live preview right-hand panel.
  const eff = {
    finalPriceCents:
      row.finalPriceCents !== null && row.finalPriceCents !== undefined
        ? row.finalPriceCents
        : row.finalPricePct !== null && row.finalPricePct !== undefined
          ? Math.round((version.basePriceCents * row.finalPricePct) / 100)
          : version.basePriceCents,
    agentBp:
      row.agentBp !== null && row.agentBp !== undefined
        ? row.agentBp
        : row.agentPct !== null && row.agentPct !== undefined
          ? Math.round(row.agentPct * 100)
          : version.agentBp,
    managerBp:
      row.managerBp !== null && row.managerBp !== undefined
        ? row.managerBp
        : row.managerPct !== null && row.managerPct !== undefined
          ? Math.round(row.managerPct * 100)
          : version.managerBp,
  };

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={row.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Row label (e.g. 'Full payment standard' or 'Premium agent tier')"
          disabled={!canEdit}
          className="text-sm"
        />
        {canEdit && (
          <button
            type="button"
            onClick={onRemove}
            className="text-red-500 hover:text-red-700 px-1"
            title="Remove row"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {showPlan && (
          <FieldBox label="Installment plan">
            <Select
              value={row.installmentPlanId ?? ""}
              onChange={(e) =>
                onChange({ installmentPlanId: e.target.value || null })
              }
              disabled={!canEdit}
            >
              <option value="">— any plan —</option>
              {plans.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} · {p.months}mo
                </option>
              ))}
            </Select>
          </FieldBox>
        )}

        {showAdvance && (
          <>
            <FieldBox label="Advance min (€)">
              <Input
                type="number"
                step="0.01"
                value={
                  row.advanceMinCents !== null && row.advanceMinCents !== undefined
                    ? (row.advanceMinCents / 100).toString()
                    : ""
                }
                onChange={(e) =>
                  onChange({
                    advanceMinCents: e.target.value
                      ? Math.round(parseFloat(e.target.value) * 100)
                      : null,
                  })
                }
                disabled={!canEdit}
                placeholder="∅"
              />
            </FieldBox>
            <FieldBox label="Advance max (€)">
              <Input
                type="number"
                step="0.01"
                value={
                  row.advanceMaxCents !== null && row.advanceMaxCents !== undefined
                    ? (row.advanceMaxCents / 100).toString()
                    : ""
                }
                onChange={(e) =>
                  onChange({
                    advanceMaxCents: e.target.value
                      ? Math.round(parseFloat(e.target.value) * 100)
                      : null,
                  })
                }
                disabled={!canEdit}
                placeholder="∅"
              />
            </FieldBox>
          </>
        )}

        <DualValueField
          label="Final price"
          unit="€"
          pctValue={row.finalPricePct}
          absoluteValue={
            row.finalPriceCents !== null && row.finalPriceCents !== undefined
              ? row.finalPriceCents / 100
              : null
          }
          onPct={(v) =>
            onChange({ finalPricePct: v, finalPriceCents: null })
          }
          onAbs={(v) =>
            onChange({
              finalPriceCents: v !== null ? Math.round(v * 100) : null,
              finalPricePct: null,
            })
          }
          disabled={!canEdit}
        />

        <DualValueField
          label="Agent commission"
          unit="bp"
          pctValue={row.agentPct}
          absoluteValue={row.agentBp}
          onPct={(v) => onChange({ agentPct: v, agentBp: null })}
          onAbs={(v) => onChange({ agentBp: v, agentPct: null })}
          disabled={!canEdit}
        />

        <DualValueField
          label="Manager commission"
          unit="bp"
          pctValue={row.managerPct}
          absoluteValue={row.managerBp}
          onPct={(v) => onChange({ managerPct: v, managerBp: null })}
          onAbs={(v) => onChange({ managerBp: v, managerPct: null })}
          disabled={!canEdit}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
        <Sparkles className="size-3 text-brand-500" />
        <span className="font-medium">Effective:</span>
        <Badge tone="brand">
          {(eff.finalPriceCents / 100).toFixed(2)} {version.currency}
        </Badge>
        <Badge tone="brand">agent {(eff.agentBp / 100).toFixed(2)}%</Badge>
        <Badge tone="brand">manager {(eff.managerBp / 100).toFixed(2)}%</Badge>
      </div>
    </div>
  );
}

function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

/**
 * Per Review 1.2 (2026-05-04) — Figma "All the fields you'll find can be both
 * inputted manually by user or setup by inputting percentages." A small
 * dual-mode field that toggles between an absolute amount and a percent of
 * base. Setting one mode clears the other so the server resolver knows which
 * value is authoritative.
 */
function DualValueField({
  label,
  unit,
  pctValue,
  absoluteValue,
  onPct,
  onAbs,
  disabled,
}: {
  label: string;
  unit: string;
  pctValue: number | null | undefined;
  absoluteValue: number | null | undefined;
  onPct: (v: number | null) => void;
  onAbs: (v: number | null) => void;
  disabled?: boolean;
}) {
  // Determine which mode is active based on which value is set.
  const mode: "pct" | "abs" =
    pctValue !== null && pctValue !== undefined
      ? "pct"
      : absoluteValue !== null && absoluteValue !== undefined
        ? "abs"
        : "abs";

  const placeholder = mode === "pct" ? "% of base" : `value (${unit})`;
  const value =
    mode === "pct"
      ? pctValue !== null && pctValue !== undefined
        ? String(pctValue)
        : ""
      : absoluteValue !== null && absoluteValue !== undefined
        ? String(absoluteValue)
        : "";

  return (
    <FieldBox label={label}>
      <div className="flex gap-1">
        <Input
          type="number"
          step="any"
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            const v = raw === "" ? null : Number(raw);
            if (mode === "pct") onPct(v);
            else onAbs(v);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="text-sm"
        />
        <button
          type="button"
          onClick={() => {
            // Toggle mode + clear the other mode's value.
            if (mode === "pct") onAbs(null);
            else onPct(null);
          }}
          disabled={disabled}
          className={`shrink-0 px-2 rounded-md text-xs font-mono border transition ${
            mode === "pct"
              ? "bg-brand-50 border-brand-300 text-brand-700"
              : "bg-slate-50 border-slate-300 text-slate-600"
          }`}
          title={mode === "pct" ? "Currently: % of base" : `Currently: absolute (${unit})`}
        >
          {mode === "pct" ? "%" : unit}
        </button>
      </div>
    </FieldBox>
  );
}
