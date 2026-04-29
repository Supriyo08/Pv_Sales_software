import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, BackLink } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { formatCents, formatDate } from "../lib/format";
import type { Customer, Contract } from "../lib/api-types";

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: customer } = useQuery<Customer>({
    queryKey: ["customer", id],
    queryFn: async () => (await api.get(`/customers/${id}`)).data,
    enabled: !!id,
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["contracts", { customerId: id }],
    queryFn: async () =>
      (await api.get("/contracts")).data.filter((c: Contract) => c.customerId === id),
    enabled: !!id,
  });

  if (!customer) return <p className="text-slate-500">Loading…</p>;

  return (
    <div>
      <BackLink to="/customers">Back to customers</BackLink>
      <PageHeader
        title={customer.fullName}
        description={`Customer · ${customer.fiscalCode}`}
        action={
          <Button asChild icon={<Plus className="size-4" />}>
            <Link to={`/contracts/new?customerId=${customer._id}`}>New contract</Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold mb-4">Customer info</h3>
          <dl className="space-y-3 text-sm">
            <Row k="Fiscal code">
              <code className="font-mono text-xs">{customer.fiscalCode}</code>
            </Row>
            <Row k="Email">{customer.email || "—"}</Row>
            <Row k="Phone">{customer.phone || "—"}</Row>
            <Row k="Address">
              {[customer.address?.line1, customer.address?.city, customer.address?.postalCode]
                .filter(Boolean)
                .join(", ") || "—"}
            </Row>
            <Row k="Created">{formatDate(customer.createdAt)}</Row>
          </dl>
        </Card>

        <Card padding={false}>
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold">Contracts ({contracts.length})</h3>
          </div>
          {contracts.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500 text-center">No contracts yet.</p>
          ) : (
            <Table>
              <THead>
                <Th>ID</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {contracts.map((c) => (
                  <Tr key={c._id}>
                    <Td>
                      <Link
                        to={`/contracts/${c._id}`}
                        className="font-mono text-xs text-brand-600 hover:text-brand-700"
                      >
                        {c._id.slice(-8)}
                      </Link>
                    </Td>
                    <Td>{formatCents(c.amountCents, c.currency)}</Td>
                    <Td>
                      <StatusBadge status={c.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex">
      <dt className="w-32 text-slate-500">{k}</dt>
      <dd className="flex-1 text-slate-900">{children}</dd>
    </div>
  );
}
