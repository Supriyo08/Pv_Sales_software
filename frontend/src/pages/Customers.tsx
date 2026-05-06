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
import type { Customer, User } from "../lib/api-types";

export function Customers() {
  const [search, setSearch] = useState("");
  const { data = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customers", search],
    queryFn: async () =>
      (await api.get("/customers", { params: search ? { search } : {} })).data,
  });

  // Per Review 1.5 (2026-05-04): table needs Current Agent + Current AM
  // columns. We resolve names from `/users` (cached) — manager is the AGENT's
  // own `managerId`. Admins/AMs always see this; agents see their own row.
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });
  const userById = new Map(users.map((u) => [u._id, u]));

  const agentForCustomer = (c: Customer): User | undefined =>
    c.assignedAgentId ? userById.get(c.assignedAgentId) : undefined;
  const managerForCustomer = (c: Customer): User | undefined => {
    const a = agentForCustomer(c);
    return a?.managerId ? userById.get(a.managerId) : undefined;
  };

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
              <Th>Surname</Th>
              <Th>City</Th>
              <Th>Current Agent</Th>
              <Th>Current Area Manager</Th>
              <Th>Created</Th>
            </THead>
            <TBody>
              {data.map((c) => {
                const agent = agentForCustomer(c);
                const manager = managerForCustomer(c);
                // For legacy records that only have `fullName`, split on the
                // last whitespace so the Surname column isn't empty.
                let firstName = c.firstName ?? "";
                let surname = c.surname ?? "";
                if (!firstName && !surname && c.fullName) {
                  const parts = c.fullName.trim().split(/\s+/);
                  if (parts.length > 1) {
                    surname = parts[parts.length - 1]!;
                    firstName = parts.slice(0, -1).join(" ");
                  } else {
                    firstName = c.fullName;
                  }
                }
                return (
                  <Tr key={c._id}>
                    <Td>
                      <Link
                        to={`/customers/${c._id}`}
                        className="font-medium text-brand-600 hover:text-brand-700"
                      >
                        {firstName || c.fullName}
                      </Link>
                    </Td>
                    <Td>{surname || <span className="text-slate-400">—</span>}</Td>
                    <Td>
                      {c.address?.city || <span className="text-slate-400">—</span>}
                    </Td>
                    <Td>
                      {agent ? (
                        agent.fullName
                      ) : (
                        <span className="text-slate-400">unassigned</span>
                      )}
                    </Td>
                    <Td>
                      {manager ? (
                        manager.fullName
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="text-slate-500">{formatDate(c.createdAt)}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
