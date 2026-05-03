import type { RequestHandler } from "express";
import * as reportService from "./report.service";

function maybeCsv(req: { query: Record<string, unknown> }, res: { setHeader: (n: string, v: string) => void; send: (b: string) => void }, name: string, rows: Record<string, unknown>[]) {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.csv"`);
  res.send(reportService.toCSV(rows));
}

export const agentEarnings: RequestHandler = async (req, res, next) => {
  try {
    const period = typeof req.query.period === "string" ? req.query.period : undefined;
    // Per Review 1.2 (2026-05-04): support multi-period filter via ?periods=p1,p2,…
    const periods =
      typeof req.query.periods === "string"
        ? (req.query.periods as string).split(",").filter(Boolean)
        : undefined;
    const rows = await reportService.agentEarnings({ period, periods });
    if (req.query.format === "csv") {
      maybeCsv(
        req,
        res,
        `agent-earnings${period ? "-" + period : periods ? "-" + periods.join("_") : ""}`,
        rows as never
      );
      return;
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// Per Review 1.2 (2026-05-04): drill-down detail for a single agent.
export const agentEarningsDetail: RequestHandler = async (req, res, next) => {
  try {
    const periods =
      typeof req.query.periods === "string"
        ? (req.query.periods as string).split(",").filter(Boolean)
        : undefined;
    res.json(
      await reportService.agentEarningsDetail({
        userId: req.params.userId!,
        periods,
      })
    );
  } catch (err) {
    next(err);
  }
};

// Per Review 1.2 (2026-05-04): drill-down detail for a single area manager.
export const networkPerformanceDetail: RequestHandler = async (req, res, next) => {
  try {
    const periods =
      typeof req.query.periods === "string"
        ? (req.query.periods as string).split(",").filter(Boolean)
        : undefined;
    res.json(
      await reportService.networkPerformanceDetail({
        managerId: req.params.managerId!,
        periods,
      })
    );
  } catch (err) {
    next(err);
  }
};

export const networkPerformance: RequestHandler = async (req, res, next) => {
  try {
    const rows = await reportService.networkPerformance();
    if (req.query.format === "csv") {
      maybeCsv(req, res, "network-performance", rows as never);
      return;
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

export const paymentSummary: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await reportService.paymentSummary());
  } catch (err) {
    next(err);
  }
};

export const pipelineFunnel: RequestHandler = async (_req, res, next) => {
  try {
    res.json(await reportService.pipelineFunnel());
  } catch (err) {
    next(err);
  }
};

export const bonusSummary: RequestHandler = async (req, res, next) => {
  try {
    const period = typeof req.query.period === "string" ? req.query.period : undefined;
    const rows = await reportService.bonusSummary({ period });
    if (req.query.format === "csv") {
      maybeCsv(req, res, `bonus-summary${period ? "-" + period : ""}`, rows as never);
      return;
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
};
