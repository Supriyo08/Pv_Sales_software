import { Router } from "express";
import * as ctrl from "./report.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);
router.use(requireRole("ADMIN", "AREA_MANAGER"));

router.get("/agent-earnings", ctrl.agentEarnings);
router.get("/network-performance", ctrl.networkPerformance);
router.get("/payment-summary", ctrl.paymentSummary);
router.get("/pipeline-funnel", ctrl.pipelineFunnel);
router.get("/bonus-summary", ctrl.bonusSummary);

export default router;
