import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDateTime } from "../lib/format";
import type { Notification } from "../lib/api-types";

export function NotificationsPage() {
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["notifications", "list"],
    queryFn: async () => (await api.get("/notifications")).data,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="In-app activity feed." />
      <Card padding={false}>
        {isLoading && <p className="px-6 py-12 text-center text-slate-500 text-sm">Loading…</p>}
        {!isLoading && data.length === 0 && (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="You'll see updates here when contracts are signed, bonuses calculated, or payments come in."
          />
        )}
        <ul className="divide-y divide-slate-100">
          {data.map((n) => (
            <li
              key={n._id}
              className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50 transition"
            >
              <div className={`mt-1.5 size-2 rounded-full shrink-0 ${n.readAt ? "bg-slate-200" : "bg-brand-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 text-sm">{n.title}</span>
                  <Badge tone="neutral">{n.kind}</Badge>
                </div>
                {n.body && <p className="text-sm text-slate-600 mt-1">{n.body}</p>}
                <p className="text-xs text-slate-400 mt-1">{formatDateTime(n.createdAt)}</p>
              </div>
              {!n.readAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => markRead.mutate(n._id)}
                  icon={<Check className="size-3.5" />}
                >
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
