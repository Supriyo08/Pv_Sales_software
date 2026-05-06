import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import type { CustomerFormConfig, CustomerFormField } from "../lib/api-types";

// Per Review 1.5 (2026-05-04): expanded built-in customer fields. Anything
// else lives in `customFields` and is admin-configurable.
const BUILTIN_KEYS = new Set([
  "fiscalCode",
  "fullName",
  "firstName",
  "surname",
  "birthDate",
  "email",
  "pecEmail",
  "phone",
  "cellphone",
  "idNumber",
  "idExpireDate",
  // Address sub-fields all live under `address`, but we keep their composite
  // sentinel here so the dynamic-schema loop doesn't shadow them.
  "address",
]);

// Per Review 1.5 (2026-05-04): the spec lists explicit User Details fields
// that must always appear on the New Customer form (Name + Surname mandatory,
// the rest optional). We render them as a fixed section above the
// admin-configurable dynamic fields so they ALWAYS appear, regardless of
// whether `customer-form` schema includes them.
type FormState = {
  firstName: string;
  surname: string;
  birthDate: string;
  email: string;
  pecEmail: string;
  cellphone: string;
  fiscalCode: string;
  idNumber: string;
  idExpireDate: string;
  addressLine1: string;
  addressCity: string;
  addressPostalCode: string;
  addressRegion: string;
};

const EMPTY: FormState = {
  firstName: "",
  surname: "",
  birthDate: "",
  email: "",
  pecEmail: "",
  cellphone: "",
  fiscalCode: "",
  idNumber: "",
  idExpireDate: "",
  addressLine1: "",
  addressCity: "",
  addressPostalCode: "",
  addressRegion: "",
};

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

  const [form, setForm] = useState<FormState>(EMPTY);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  // Initialise blank values for every CUSTOM (non-built-in) field once the
  // schema arrives — built-ins are always rendered.
  useEffect(() => {
    if (!schema) return;
    setCustomValues((cur) => {
      const next = { ...cur };
      for (const f of schema.fields) {
        if (BUILTIN_KEYS.has(f.key)) continue;
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
      // Per Review 1.5: client-side guard — Name + Surname are mandatory at
      // create. Everything else is optional (PEC enforced later before
      // installation planning).
      if (!form.firstName.trim() || !form.surname.trim()) {
        throw new Error("First name and surname are mandatory");
      }

      const body: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        surname: form.surname.trim(),
        fullName: `${form.firstName.trim()} ${form.surname.trim()}`.trim(),
      };
      if (form.birthDate) body.birthDate = form.birthDate;
      if (form.email) body.email = form.email;
      if (form.pecEmail) body.pecEmail = form.pecEmail;
      if (form.cellphone) body.cellphone = form.cellphone;
      if (form.fiscalCode) body.fiscalCode = form.fiscalCode.toUpperCase();
      if (form.idNumber) body.idNumber = form.idNumber;
      if (form.idExpireDate) body.idExpireDate = form.idExpireDate;

      const address: Record<string, string> = {};
      if (form.addressLine1) address.line1 = form.addressLine1;
      if (form.addressCity) address.city = form.addressCity;
      if (form.addressPostalCode) address.postalCode = form.addressPostalCode;
      if (form.addressRegion) address.region = form.addressRegion;
      if (Object.keys(address).length) body.address = address;

      const customFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(customValues)) {
        if (v !== "") customFields[k] = v;
      }
      if (Object.keys(customFields).length) body.customFields = customFields;

      const { data } = await api.post("/customers", body);
      navigate(`/customers/${data._id}`);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ??
          (err as Error).message ??
          "Failed to create customer"
      );
    } finally {
      setSaving(false);
    }
  };

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

  // Only render dynamic fields that are NOT built-ins (built-ins handled above).
  const customSchemaFields = [...schema.fields]
    .filter((f) => !BUILTIN_KEYS.has(f.key))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div>
      <BackLink to="/customers">Back to customers</BackLink>
      <PageHeader
        title="New customer"
        description="Per Review 1.5: only Name + Surname are mandatory. PEC, ID details and address can be filled now or later. PEC becomes mandatory before installation planning."
      />
      <Card className="max-w-2xl">
        <form onSubmit={submit} className="space-y-6">
          {/* ── User Details ───────────────────────────────────────────── */}
          <Section title="User details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name" required>
                <Input
                  value={form.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                  required
                  placeholder="Mario"
                />
              </Field>
              <Field label="Surname" required>
                <Input
                  value={form.surname}
                  onChange={(e) => setField("surname", e.target.value)}
                  required
                  placeholder="Rossi"
                />
              </Field>
              <Field label="Birth date">
                <Input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setField("birthDate", e.target.value)}
                />
              </Field>
              <Field label="Fiscal code (codice fiscale)">
                <Input
                  value={form.fiscalCode}
                  onChange={(e) => setField("fiscalCode", e.target.value)}
                  placeholder="RSSMRA80A01H501T"
                  maxLength={16}
                  className="uppercase"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="mario.rossi@example.com"
                />
              </Field>
              <Field
                label="PEC email"
                hint="Optional now — mandatory before installation planning."
              >
                <Input
                  type="email"
                  value={form.pecEmail}
                  onChange={(e) => setField("pecEmail", e.target.value)}
                  placeholder="mario.rossi@pec.it"
                />
              </Field>
              <Field label="Cellphone">
                <Input
                  type="tel"
                  value={form.cellphone}
                  onChange={(e) => setField("cellphone", e.target.value)}
                  placeholder="+39 320 44 14 489"
                />
              </Field>
            </div>
          </Section>

          {/* ── Living Address ────────────────────────────────────────── */}
          <Section title="Living address">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Field label="Road & number">
                  <Input
                    value={form.addressLine1}
                    onChange={(e) => setField("addressLine1", e.target.value)}
                    placeholder="Via Monticello Sc, 1"
                  />
                </Field>
              </div>
              <Field label="City">
                <Input
                  value={form.addressCity}
                  onChange={(e) => setField("addressCity", e.target.value)}
                  placeholder="Arienzo"
                />
              </Field>
              <Field label="Postal code">
                <Input
                  value={form.addressPostalCode}
                  onChange={(e) => setField("addressPostalCode", e.target.value)}
                  placeholder="81021"
                />
              </Field>
              <Field label="Province">
                <Input
                  value={form.addressRegion}
                  onChange={(e) => setField("addressRegion", e.target.value)}
                  placeholder="CE"
                />
              </Field>
            </div>
          </Section>

          {/* ── ID Document ───────────────────────────────────────────── */}
          <Section
            title="Identity document"
            hint="Front + back card photos can be uploaded after creation, from the customer detail page."
          >
            <div className="grid grid-cols-2 gap-4">
              <Field label="ID number">
                <Input
                  value={form.idNumber}
                  onChange={(e) => setField("idNumber", e.target.value)}
                  placeholder="CA12345AB"
                />
              </Field>
              <Field label="ID expiry">
                <Input
                  type="date"
                  value={form.idExpireDate}
                  onChange={(e) => setField("idExpireDate", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* ── Custom (admin-configurable) fields ────────────────────── */}
          {customSchemaFields.length > 0 && (
            <Section title="Additional fields">
              <div className="grid grid-cols-2 gap-4">
                {customSchemaFields.map((f) => (
                  <div key={f.key} className={spanFor(f)}>
                    <DynamicField
                      field={f}
                      value={customValues[f.key] ?? ""}
                      onChange={(v) =>
                        setCustomValues((s) => ({ ...s, [f.key]: v }))
                      }
                    />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="submit" loading={saving}>
              Create customer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/customers")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-900 mb-1">{title}</div>
      {hint && <p className="text-xs text-slate-500 mb-3">{hint}</p>}
      {children}
    </div>
  );
}

function spanFor(f: CustomerFormField): string {
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
