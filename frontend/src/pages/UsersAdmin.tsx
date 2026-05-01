import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PowerOff,
  Power,
  UserPlus,
  Pencil,
  ExternalLink,
  KeyRound,
} from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Badge, StatusBadge } from "../components/ui/Badge";
import { Avatar } from "../components/ui/Avatar";
import { Table, THead, TBody, Tr, Th, Td } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { formatDate } from "../lib/format";
import type { User, Territory } from "../lib/api-types";

const ROLES = ["ADMIN", "AREA_MANAGER", "AGENT"] as const;

type EditState = {
  userId: string;
  fullName: string;
  role: (typeof ROLES)[number];
  managerId: string;
  territoryId: string;
};

export function UsersAdmin() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "AGENT" as (typeof ROLES)[number],
    managerId: "",
    territoryId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [includeInactive, setIncludeInactive] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users", { includeInactive }],
    queryFn: async () =>
      (
        await api.get("/users", {
          params: { includeInactive: includeInactive ? "true" : undefined },
        })
      ).data,
  });

  const { data: territories = [] } = useQuery<Territory[]>({
    queryKey: ["territories"],
    queryFn: async () => (await api.get("/territories")).data,
  });

  const userById = new Map(users.map((u) => [u._id, u]));
  const territoryById = new Map(territories.map((t) => [t._id, t]));

  const eligibleManagersFor = (role: (typeof ROLES)[number]) => {
    if (role === "AREA_MANAGER") return users.filter((u) => u.role === "ADMIN");
    if (role === "AGENT") return users.filter((u) => u.role === "AREA_MANAGER");
    return [];
  };

  const create = useMutation({
    mutationFn: async () =>
      api.post("/users", {
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
        managerId: form.managerId || undefined,
        territoryId: form.territoryId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowForm(false);
      setForm({
        email: "",
        password: "",
        fullName: "",
        role: "AGENT",
        managerId: "",
        territoryId: "",
      });
      setError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setError(err?.response?.data?.error ?? "Failed"),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      return api.patch(`/users/${editing.userId}`, {
        fullName: editing.fullName,
        role: editing.role,
        managerId: editing.managerId || null,
        territoryId: editing.territoryId || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditing(null);
      setEditError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setEditError(err?.response?.data?.error ?? "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => api.post(`/users/${id}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const resetPassword = useMutation({
    mutationFn: async (input: { id: string; newPassword: string }) =>
      api.post(`/users/${input.id}/reset-password`, { newPassword: input.newPassword }),
    onSuccess: () => {
      setResetTarget(null);
      setResetPwd("");
      setResetError(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) =>
      setResetError(err?.response?.data?.error ?? "Failed"),
  });

  const startEdit = (u: User) => {
    setEditing({
      userId: u._id,
      fullName: u.fullName,
      role: u.role,
      managerId: u.managerId ?? "",
      territoryId: u.territoryId ?? "",
    });
    setEditError(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Create, edit, deactivate, reset passwords. Click any user to see their performance + payments."
        action={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="size-3.5 rounded border-slate-300"
              />
              Show inactive
            </label>
            {!showForm && (
              <Button onClick={() => setShowForm(true)} icon={<UserPlus className="size-4" />}>
                New user
              </Button>
            )}
          </div>
        }
      />

      {showForm && (
        <Card>
          <h3 className="font-semibold mb-4">New user</h3>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <Field label="Full name" required>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label="Password" required hint="At least 8 characters">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
                required
              />
            </Field>
            <Field label="Role" required>
              <Select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as never, managerId: "" })
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {form.role !== "ADMIN" && (
              <Field label="Manager" hint={form.role === "AGENT" ? "Optional — agents may operate without an area manager" : undefined}>
                <Select
                  value={form.managerId}
                  onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                >
                  <option value="">— None —</option>
                  {eligibleManagersFor(form.role).map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Territory">
              <Select
                value={form.territoryId}
                onChange={(e) => setForm({ ...form, territoryId: e.target.value })}
              >
                <option value="">— None —</option>
                {territories.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => create.mutate()} loading={create.isPending}>
              Create user
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {editing && (
        <Card>
          <h3 className="font-semibold mb-4">
            Edit{" "}
            <span className="text-slate-500 text-sm">
              · {userById.get(editing.userId)?.email}
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <Field label="Full name" required>
              <Input
                value={editing.fullName}
                onChange={(e) => setEditing({ ...editing, fullName: e.target.value })}
                required
              />
            </Field>
            <Field label="Role" required>
              <Select
                value={editing.role}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    role: e.target.value as (typeof ROLES)[number],
                    managerId: "",
                  })
                }
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {editing.role !== "ADMIN" && (
              <Field
                label="Manager"
                hint={editing.role === "AGENT" ? "Optional" : "Optional (must be ADMIN if set)"}
              >
                <Select
                  value={editing.managerId}
                  onChange={(e) => setEditing({ ...editing, managerId: e.target.value })}
                >
                  <option value="">— None —</option>
                  {eligibleManagersFor(editing.role).map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.fullName} ({u.role})
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Territory">
              <Select
                value={editing.territoryId}
                onChange={(e) => setEditing({ ...editing, territoryId: e.target.value })}
              >
                <option value="">— None —</option>
                {territories.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {editError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {editError}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => update.mutate()} loading={update.isPending}>
              Save changes
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        <CardHeader title={`All users (${users.length})`} />
        {users.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No users"
            description="Add your first user to get started."
          />
        ) : (
          <Table>
            <THead>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Manager</Th>
              <Th>Territory</Th>
              <Th>Created</Th>
              <Th></Th>
            </THead>
            <TBody>
              {users.map((u) => {
                const inactive = !!u.deletedAt;
                return (
                <Tr key={u._id} className={inactive ? "opacity-60" : ""}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.fullName} size="sm" />
                      <div>
                        <div className="font-medium text-slate-900 flex items-center gap-2">
                          <Link
                            to={`/admin/users/${u._id}`}
                            className="hover:text-brand-600"
                          >
                            {u.fullName}
                          </Link>
                          {inactive && <Badge tone="neutral">inactive</Badge>}
                        </div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={u.role} />
                  </Td>
                  <Td className="text-slate-600">
                    {u.managerId ? (
                      userById.get(u.managerId)?.fullName ?? "—"
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-slate-600">
                    {u.territoryId ? (
                      territoryById.get(u.territoryId)?.name ?? "—"
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-slate-500">{formatDate(u.createdAt)}</Td>
                  <Td>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<ExternalLink className="size-3.5 text-slate-500" />}
                        asChild
                      >
                        <Link to={`/admin/users/${u._id}`}>Profile</Link>
                      </Button>
                      {!inactive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil className="size-3.5 text-slate-500" />}
                          onClick={() => startEdit(u)}
                        >
                          Edit
                        </Button>
                      )}
                      {!inactive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<KeyRound className="size-3.5 text-slate-600" />}
                          onClick={() => {
                            setResetTarget(u);
                            setResetPwd("");
                            setResetError(null);
                          }}
                        >
                          Reset password
                        </Button>
                      )}
                      {inactive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Power className="size-3.5 text-emerald-600" />}
                          onClick={() => reactivate.mutate(u._id)}
                        >
                          <span className="text-emerald-700">Reactivate</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<PowerOff className="size-3.5 text-red-500" />}
                          onClick={() => {
                            if (confirm(`Deactivate ${u.fullName}? They will not be able to log in.`)) {
                              remove.mutate(u._id);
                            }
                          }}
                        >
                          <span className="text-red-600">Deactivate</span>
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setResetPwd("");
            setResetError(null);
          }
        }}
        title={`Reset password for ${resetTarget?.fullName ?? ""}`}
        description="The user will be logged out of all sessions and must use the new password to sign back in."
        footer={
          <>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                resetTarget &&
                resetPassword.mutate({ id: resetTarget._id, newPassword: resetPwd })
              }
              loading={resetPassword.isPending}
              disabled={resetPwd.length < 8}
            >
              Reset password
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {resetError && (
            <p className="text-sm text-red-600">{resetError}</p>
          )}
          <Field label="New password" required hint="At least 8 characters.">
            <Input
              type="password"
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              autoFocus
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
