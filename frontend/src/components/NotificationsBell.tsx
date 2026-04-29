import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function NotificationsBell() {
  const { data } = useQuery<{ count: number }>({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => (await api.get("/notifications/unread-count")).data,
    refetchInterval: 30_000,
  });
  const count = data?.count ?? 0;
  return (
    <Link
      to="/notifications"
      className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition"
      title="Notifications"
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute top-1 right-1 size-4 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center ring-2 ring-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
