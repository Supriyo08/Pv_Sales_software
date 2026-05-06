import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { api } from "../lib/api";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Input";
import { Avatar } from "./ui/Avatar";
import { formatDateTime } from "../lib/format";
import type { CustomerNote, User } from "../lib/api-types";

type Props = {
  customerId: string;
};

/**
 * Per Review 1.5 (2026-05-04): "Notes over customer — A chat with everyone
 * can write notes over the customer." Append-only feed showing author + body,
 * sorted newest-first. Polled every 30s for collaborative use.
 */
export function CustomerNotes({ customerId }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: notes = [], isLoading } = useQuery<CustomerNote[]>({
    queryKey: ["customer-notes", customerId],
    queryFn: async () =>
      (await api.get<CustomerNote[]>(`/customers/${customerId}/notes`)).data,
    refetchInterval: 30_000,
  });

  // Pull /users once (cached) so we can show author names + avatars.
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
  });
  const userById = new Map(users.map((u) => [u._id, u]));

  const post = useMutation({
    mutationFn: async () =>
      api.post(`/customers/${customerId}/notes`, { body: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["customer-notes", customerId] });
    },
  });

  return (
    <Card padding={false}>
      <div className="px-6 py-3 border-b border-slate-200 flex items-center gap-2">
        <MessageSquare className="size-4 text-slate-500" />
        <h3 className="font-semibold">Notes</h3>
        <span className="text-xs text-slate-500">({notes.length})</span>
      </div>

      <div className="p-4 border-b border-slate-200 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave a note for everyone working on this customer…"
          rows={2}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => post.mutate()}
            loading={post.isPending}
            disabled={draft.trim().length === 0}
            icon={<Send className="size-3.5" />}
          >
            Post note
          </Button>
        </div>
      </div>

      <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {isLoading ? (
          <p className="px-6 py-6 text-sm text-slate-500">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="px-6 py-6 text-sm text-slate-500 text-center">
            No notes yet — be the first to leave one.
          </p>
        ) : (
          notes.map((n) => {
            const author = userById.get(n.authorId);
            return (
              <div key={n._id} className="px-6 py-3 flex gap-3">
                <Avatar
                  name={author?.fullName ?? n.authorId.slice(-4)}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {author?.fullName ?? "Unknown user"}
                    </span>
                    <span className="text-slate-400">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">
                    {n.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
