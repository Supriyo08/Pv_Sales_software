import {
  CustomerFormConfig,
  BUILTIN_FIELDS,
  type CustomerFieldType,
} from "./customer-form.model";
import { HttpError } from "../../middleware/error";

type FieldInput = {
  key: string;
  label: string;
  type: CustomerFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  order?: number;
};

/** Get the singleton config; if missing, return one with just the builtins. */
export async function get() {
  let cfg = await CustomerFormConfig.findOne({ singleton: true });
  if (!cfg) {
    cfg = await CustomerFormConfig.create({ singleton: true, fields: BUILTIN_FIELDS });
  }
  return cfg;
}

export async function update(fields: FieldInput[], updatedBy: string) {
  // Always preserve builtins (cannot delete or change their type/key/builtin).
  const builtinKeys = new Set(BUILTIN_FIELDS.map((b) => b.key));
  const incomingByKey = new Map(fields.map((f) => [f.key, f]));
  const merged = [
    // Builtins, with label/required overrides allowed; type/key fixed.
    ...BUILTIN_FIELDS.map((b) => {
      const overrides = incomingByKey.get(b.key);
      return {
        ...b,
        label: overrides?.label ?? b.label,
        required: overrides?.required ?? b.required,
        placeholder: overrides?.placeholder ?? "",
        helpText: overrides?.helpText ?? "",
        order: overrides?.order ?? b.order,
      };
    }),
    // Custom fields.
    ...fields
      .filter((f) => !builtinKeys.has(f.key))
      .map((f, i) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required ?? false,
        placeholder: f.placeholder ?? "",
        helpText: f.helpText ?? "",
        options: f.options ?? [],
        builtin: false,
        order: f.order ?? 100 + i,
      })),
  ].sort((a, b) => a.order - b.order);

  // Validate keys are unique + safe.
  const seen = new Set<string>();
  for (const f of merged) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.key)) {
      throw new HttpError(400, `Invalid field key: ${f.key} (must be a valid identifier)`);
    }
    if (seen.has(f.key)) throw new HttpError(400, `Duplicate field key: ${f.key}`);
    seen.add(f.key);
  }

  const cfg = await CustomerFormConfig.findOneAndUpdate(
    { singleton: true },
    { fields: merged, updatedBy },
    { new: true, upsert: true }
  );
  return cfg!;
}
