import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";

export function CustomerNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fiscalCode: "",
    fullName: "",
    email: "",
    phone: "",
    addressLine1: "",
    city: "",
    postalCode: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { data } = await api.post("/customers", {
        fiscalCode: form.fiscalCode,
        fullName: form.fullName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: {
          line1: form.addressLine1,
          city: form.city,
          postalCode: form.postalCode,
        },
      });
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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <BackLink to="/customers">Back to customers</BackLink>
      <PageHeader title="New customer" description="Add a customer record. Fiscal code must be unique." />
      <Card className="max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fiscal code" required>
              <Input value={form.fiscalCode} onChange={set("fiscalCode")} required />
            </Field>
            <Field label="Full name" required>
              <Input value={form.fullName} onChange={set("fullName")} required />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} />
            </Field>
            <div className="col-span-2">
              <Field label="Address line 1">
                <Input value={form.addressLine1} onChange={set("addressLine1")} />
              </Field>
            </div>
            <Field label="City">
              <Input value={form.city} onChange={set("city")} />
            </Field>
            <Field label="Postal code">
              <Input value={form.postalCode} onChange={set("postalCode")} />
            </Field>
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
