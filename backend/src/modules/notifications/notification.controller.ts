import type { RequestHandler } from "express";
import * as notificationService from "./notification.service";
import { HttpError } from "../../middleware/error";

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const unreadOnly = req.query.unread === "true";
    res.json(await notificationService.listForUser(req.user.sub, { unreadOnly }));
  } catch (err) {
    next(err);
  }
};

export const unreadCount: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    res.json({ count: await notificationService.unreadCount(req.user.sub) });
  } catch (err) {
    next(err);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw new HttpError(401, "Unauthenticated");
    const n = await notificationService.markRead(req.params.id!, req.user.sub);
    res.json(n);
  } catch (err) {
    next(err);
  }
};
