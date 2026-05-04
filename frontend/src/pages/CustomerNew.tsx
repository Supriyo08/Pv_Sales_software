import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import type { CustomerFormConfig, CustomerFormField } from "../lib/api-types";

const BUILTIN_KEYS = new Set(["fiscalCode", "fullName", "email", "phone"]);

export function CustomerNew() {
  const navigate = useNavigate();
  const {
    data: schema,
    isLoading: schemaLoading,
    error: schemaError,
    refetch: refetchSchema,
  } = useQuery<CustomerFormConfig>({
    queryKey: ["customer-form"],
    queryFn: async () => (await api.get("/customer-form")).data,
  });

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialise blank values for every field once the schema arrives.
  useEffect(() => {
    if (!schema) return;
    setValues((cur) => {
      const next = { ...cur };
      for (const f of schema.fields) {
        if (next[f.key] === undefined) next[f.key] = "";
      }
      return next;
    });
  }, [schema]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Split builtins (top-level fields on Customer) vs custom (go into customFields).
      const body: Record<string, unknown> = {};
      const customFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === "") continue;
        if (BUILTIN_KEYS.has(k)) {
          body[k] = v;
        } else {
          customFields[k] = v;
        }
      }
      if (Object.keys(customFields).length > 0) body.customFields = customFields;

      const { data } = await api.post("/customers", body);
      navigate(`/customers/${data._id}`);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Failed to create customer"
      );
    } finally {
      setSaving(false);
    }
  };

  // Distinguish "still loading" vs "fetch failed" vs "actually empty" so the
  // page never hangs silently on undefined.
  if (schemaLoading) return <p className="text-slate-500">Loading…</p>;
  if (schemaError || !schema) {
    const msg =
      (schemaError as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ??
      (schemaError as Error | undefined)?.message ??
      "Couldn't load the customer form schema.";
    return (
      <div>
        <BackLink to="/customers">Back to customers</BackLink>
        <PageHeader title="New customer" />
        <Card className="max-w-xl">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-3">
            {msg}
          </div>
          <Button variant="outline" onClick={() => refetchSchema()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  // Sort fields by `order` for stable display.
  const sorted = [...schema.fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div>
      <BackLink to="/customers">Back to customers</BackLink>
      <PageHeader
        title="New customer"
        description="Form fields are configurable by an admin. Fiscal code must be unique."
      />
      <Card className="max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {sorted.map((f) => (
              <div key={f.key} className={spanFor(f)}>
                <DynamicField
                  field={f}
                  value={values[f.key] ?? ""}
                  onChange={(v) => setValues({ ...values, [f.key]: v })}
                />
              </div>
            ))}
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="submit" loading={saving}>
              Create customer
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/customers")}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function spanFor(f: CustomerFormField): string {
  // Textareas + select with many options span the full row for readability.
  if (f.type === "textarea") return "col-span-2";
  return "";
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: CustomerFormField;
  value: string;
  onChange: (v: string) => void;
}) {
  const common = {
    label: field.label,
    required: field.required,
    hint: field.helpText,
  };

  if (field.type === "select") {
    return (
      <Field {...common}>
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.type === "textarea") {
    return (
      <Field {...common}>
        <Textarea
          value={value}
          onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
          required={field.required}
          placeholder={field.placeholder}
          rows={4}
        />
      </Field>
    );
  }

  return (
    <Field {...common}>
      <Input
        type={field.type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        placeholder={field.placeholder}
      />
    </Field>
  );
}
