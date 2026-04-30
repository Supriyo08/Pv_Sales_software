import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Lock } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import type {
  CustomerFormConfig,
  CustomerFormField,
  CustomerFieldType,
} from "../lib/api-types";

const TYPES: CustomerFieldType[] = [
  "text",
  "email",
  "tel",
  "date",
  "number",
  "select",
  "textarea",
];

export function CustomerFormAdmin() {
  const qc = useQueryClient();
  const { data } = useQuery<CustomerFormConfig>({
    queryKey: ["customer-form"],
    queryFn: async () => (await api.get("/customer-form")).data,
  });

  const [fields, setFields] = useState<CustomerFormField[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) setFields(data.fields);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => api.put("/customer-form", { fields }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-form"] });
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const update = (idx: number, patch: Partial<CustomerFormField>) =>
    setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));

  const addField = () =>
    setFields([
      ...fields,
      {
        key: "",
        label: "",
        type: "text",
        required: false,
        placeholder: "",
        helpText: "",
        options: [],
        order: 100 + fields.length,
      },
    ]);

  const removeField = (idx: number) => {
    const f = fields[idx];
    if (f?.builtin) return;
    setFields(fields.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Customer form"
        description="Add or remove fields from the customer creation form. Built-in fields (fiscal code, name, email, phone) cannot be deleted."
        action={
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save changes
          </Button>
        }
      />

      <Card padding={false}>
        <CardHeader
          title={`${fields.length} field(s)`}
          action={
            <Button size="sm" variant="outline" onClick={addField} icon={<Plus className="size-4" />}>
              Add custom field
            </Button>
          }
        />
        <div className="p-6 space-y-3">
          {fields.map((f, idx) => (
            <div
              key={`${f.key}-${idx}`}
              className="grid grid-cols-12 gap-2 items-start bg-slate-50 border border-slate-200 rounded-lg p-3"
            >
              <div className="col-span-3">
                <Field label="Key">
                  <Input
                    value={f.key}
                    onChange={(e) => update(idx, { key: e.target.value })}
                    disabled={!!f.builtin}
                    placeholder="e.g. iban"
                    className="font-mono text-xs"
                  />
                </Field>
              </div>
              <div className="col-span-3">
                <Field label="Label">
                  <Input
                    value={f.label}
                    onChange={(e) => update(idx, { label: e.target.value })}
                  />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Type">
                  <Select
                    value={f.type}
                    onChange={(e) =>
                      update(idx, { type: e.target.value as CustomerFieldType })
                    }
                    disabled={!!f.builtin}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Required">
                  <label className="inline-flex items-center gap-2 mt-2 text-sm">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => update(idx, { required: e.target.checked })}
                      className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Required
                  </label>
                </Field>
              </div>
              <div className="col-span-2 pt-6">
                {f.builtin ? (
                  <Badge tone="neutral">
                    <Lock className="size-3" /> built-in
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="size-3.5 text-red-500" />}
                    onClick={() => removeField(idx)}
                  >
                    <span className="text-red-600">Remove</span>
                  </Button>
                )}
              </div>
              {f.type === "select" && (
                <div className="col-span-12">
                  <Field label="Options (comma-separated)">
                    <Input
                      value={(f.options ?? []).join(", ")}
                      onChange={(e) =>
                        update(idx, {
                          options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        })
                      }
                    />
                  </Field>
                </div>
              )}
              <div className="col-span-6">
                <Field label="Placeholder">
                  <Input
                    value={f.placeholder ?? ""}
                    onChange={(e) => update(idx, { placeholder: e.target.value })}
                  />
                </Field>
              </div>
              <div className="col-span-6">
                <Field label="Help text">
                  <Input
                    value={f.helpText ?? ""}
                    onChange={(e) => update(idx, { helpText: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
        {error && (
          <div className="mx-6 mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </Card>
    </div>
  );
}
