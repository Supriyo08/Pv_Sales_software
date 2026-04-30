import { PricingFormula, type PricingVariable } from "./pricing.model";
import { HttpError } from "../../middleware/error";

type StepRuleInput = {
  variable: PricingVariable;
  thresholdKwh: number;
  addCents: number;
  label?: string;
};

type CreateInput = {
  name: string;
  description?: string;
  panelsBasePerKwhCents: number;
  batteryBasePerKwhCents: number;
  stepRules?: StepRuleInput[];
  currency?: string;
  active?: boolean;
  createdBy: string;
};

type UpdateInput = Partial<Omit<CreateInput, "createdBy">>;

export type QuoteResult = {
  panelsKwh: number;
  batteryKwh: number;
  panelsBaseCents: number;
  batteryBaseCents: number;
  steps: { label: string; addCents: number; matchedRule: StepRuleInput }[];
  totalCents: number;
  currency: string;
};

export async function list(opts: { activeOnly?: boolean } = {}) {
  const q: Record<string, unknown> = { deletedAt: null };
  if (opts.activeOnly) q.active = true;
  return PricingFormula.find(q).sort({ name: 1 });
}

export async function getById(id: string) {
  const f = await PricingFormula.findOne({ _id: id, deletedAt: null });
  if (!f) throw new HttpError(404, "Pricing formula not found");
  return f;
}

export async function create(input: CreateInput) {
  const exists = await PricingFormula.findOne({ name: input.name, deletedAt: null });
  if (exists) throw new HttpError(409, "Pricing formula with this name already exists");
  return PricingFormula.create({
    name: input.name,
    description: input.description ?? "",
    panelsBasePerKwhCents: input.panelsBasePerKwhCents,
    batteryBasePerKwhCents: input.batteryBasePerKwhCents,
    stepRules: input.stepRules ?? [],
    currency: input.currency ?? "EUR",
    active: input.active ?? true,
    createdBy: input.createdBy,
  });
}

export async function update(id: string, input: UpdateInput) {
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) updates[k] = v;
  }
  const updated = await PricingFormula.findOneAndUpdate(
    { _id: id, deletedAt: null },
    updates,
    { new: true }
  );
  if (!updated) throw new HttpError(404, "Pricing formula not found");
  return updated;
}

export async function softDelete(id: string) {
  const r = await PricingFormula.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date(), active: false },
    { new: true }
  );
  if (!r) throw new HttpError(404, "Pricing formula not found");
  return r;
}

/**
 * Evaluate a quote.
 * total = (panelsKwh × panelsBasePerKwhCents) + (batteryKwh × batteryBasePerKwhCents)
 *       + Σ (matched step rule add amounts)
 *
 * A step rule matches when the corresponding variable's input value is strictly greater
 * than the rule's threshold. Multiple rules may match for the same variable.
 */
export function quote(
  formula: {
    panelsBasePerKwhCents: number;
    batteryBasePerKwhCents: number;
    stepRules: { variable: PricingVariable; thresholdKwh: number; addCents: number; label?: string }[];
    currency?: string;
  },
  input: { panelsKwh: number; batteryKwh: number }
): QuoteResult {
  if (input.panelsKwh < 0 || input.batteryKwh < 0) {
    throw new HttpError(400, "kWh values must be non-negative");
  }

  const panelsBaseCents = Math.round(input.panelsKwh * formula.panelsBasePerKwhCents);
  const batteryBaseCents = Math.round(input.batteryKwh * formula.batteryBasePerKwhCents);

  const value = (v: PricingVariable) =>
    v === "panels" ? input.panelsKwh : input.batteryKwh;

  const steps: QuoteResult["steps"] = [];
  for (const rule of formula.stepRules) {
    if (value(rule.variable) > rule.thresholdKwh) {
      steps.push({
        label: rule.label || `${rule.variable} > ${rule.thresholdKwh}kWh`,
        addCents: rule.addCents,
        matchedRule: rule,
      });
    }
  }

  const totalCents =
    panelsBaseCents + batteryBaseCents + steps.reduce((acc, s) => acc + s.addCents, 0);

  return {
    panelsKwh: input.panelsKwh,
    batteryKwh: input.batteryKwh,
    panelsBaseCents,
    batteryBaseCents,
    steps,
    totalCents,
    currency: formula.currency ?? "EUR",
  };
}
