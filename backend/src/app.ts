import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { errorHandler, notFound } from "./middleware/error";
import { requestId } from "./middleware/requestId";
import apiV1 from "./routes";

export function createApp() {
  const app = express();

  // helmet — disable cross-origin-resource-policy so the frontend (different port in dev)
  // can fetch /uploads. Tighten in prod by serving uploads from same origin.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId?: string }).requestId ?? "",
    })
  );

  app.get("/health", (_req, res) => {
    const mongoOk = mongoose.connection.readyState === 1;
    res.json({ status: "ok", mongo: mongoOk ? "up" : "down" });
  });

  // Serve uploaded files (signed contract scans, etc.) — see document.controller.upload
  app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), "uploads"), {
      // Prevent directory listing; only serve known files.
      index: false,
      fallthrough: false,
    })
  );

  app.use("/v1", apiV1);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
