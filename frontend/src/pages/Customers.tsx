import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Users as UsersIcon } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDate } from "../lib/format";
import type { Customer } from "../lib/api-types";

export function Customers() {
  const [search, setSearch] = useState("");
  const { data = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers", search],
    queryFn: async () =>
      (await api.get("/customers", { params: search ? { search } : {} })).data,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Search, view, and create customer records."
        action={
          <Button asChild icon={<Plus className="size-4" />}>
            <Link to="/customers/new">New customer</Link>
          </Button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or fiscal code"
              className="pl-9"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : data.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="No customers found"
            description={search ? "Try a different search term." : "Add your first customer to get started."}
            action={
              !search && (
                <Button asChild icon={<Plus className="size-4" />}>
                  <Link to="/customers/new">New customer</Link>
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th>Fiscal code</Th>
              <Th>Email</Th>
              <Th>Created</Th>
            </THead>
            <TBody>
              {data.map((c) => (
                <Tr key={c._id}>
                  <Td>
                    <Link
                      to={`/customers/${c._id}`}
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      {c.fullName}
                    </Link>
                  </Td>
                  <Td>
                    <code className="text-xs font-mono text-slate-600">{c.fiscalCode}</code>
                  </Td>
                  <Td>{c.email || <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-slate-500">{formatDate(c.createdAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
