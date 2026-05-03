import { Router } from "express";
import * as ctrl from "./report.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);
router.use(requireRole("ADMIN", "AREA_MANAGER"));

router.get("/agent-earnings", ctrl.agentEarnings);
// Per Review 1.2 (2026-05-04): per-agent + per-AM drill-downs.
router.get("/agent-earnings/:userId", ctrl.agentEarningsDetail);
router.get("/network-performance", ctrl.networkPerformance);
router.get("/network-performance/:managerId", ctrl.networkPerformanceDetail);
router.get("/payment-summary", ctrl.paymentSummary);
router.get("/pipeline-funnel", ctrl.pipelineFunnel);
router.get("/bonus-summary", ctrl.bonusSummary);

export default router;
