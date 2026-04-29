import type { RequestHandler } from "express";
import { randomUUID } from "crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers["x-request-id"];
  req.requestId =
    typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
};
