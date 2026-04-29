import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, FileSignature } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { StatusBadge } from "../components/ui/Badge";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatCents, formatDate } from "../lib/format";
import type { Contract, Customer } from "../lib/api-types";

export function Contracts() {
  const { data: contracts = [], isLoading } = useQuery<Contract[]>({
    queryKey: ["contracts"],
    queryFn: async () => (await api.get("/contracts")).data,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["customers", ""],
    queryFn: async () => (await api.get("/customers")).data,
  });
  const customerById = new Map(customers.map((c) => [c._id, c]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contracts"
        description="Track every deal from draft to signed to cancelled."
        action={
          <Button asChild icon={<Plus className="size-4" />}>
            <Link to="/contracts/new">New contract</Link>
          </Button>
        }
      />
      <Card padding={false}>
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : contracts.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="No contracts yet"
            description="Create your first contract to start the sales pipeline."
            action={
              <Button asChild icon={<Plus className="size-4" />}>
                <Link to="/contracts/new">New contract</Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <Th>ID</Th>
              <Th>Customer</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Signed</Th>
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
                  <Td>{customerById.get(c.customerId)?.fullName ?? <span className="text-slate-400">—</span>}</Td>
                  <Td className="font-medium">{formatCents(c.amountCents, c.currency)}</Td>
                  <Td>
                    <StatusBadge status={c.status} />
                  </Td>
                  <Td className="text-slate-500">{formatDate(c.signedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
