import { Notification, NOTIFICATION_KINDS } from "./notification.model";
import { HttpError } from "../../middleware/error";

type CreateInput = {
  userId: string;
  kind: (typeof NOTIFICATION_KINDS)[number];
  title: string;
  body?: string;
  payload?: Record<string, unknown> | null;
};

export async function create(input: CreateInput) {
  return Notification.create({
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? "",
    payload: input.payload ?? null,
  });
}

export async function listForUser(userId: string, opts: { unreadOnly?: boolean }) {
  const q: Record<string, unknown> = { userId };
  if (opts.unreadOnly) q.readAt = null;
  return Notification.find(q).sort({ createdAt: -1 }).limit(100);
}

export async function markRead(id: string, userId: string) {
  const n = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { readAt: new Date() },
    { new: true }
  );
  if (!n) throw new HttpError(404, "Notification not found");
  return n;
}

export async function unreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId, readAt: null });
}
