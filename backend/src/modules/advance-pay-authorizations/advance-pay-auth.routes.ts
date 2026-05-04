import { Router } from "express";
import * as ctrl from "./advance-pay-auth.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.get("/pending-count", ctrl.pendingCount);
router.get("/:id", ctrl.get);
// Per Review 1.2 (2026-05-04): two-stage decision flow.
// Stage 1: assigned area manager (or admin acting in that role).
router.post(
  "/:id/decide-manager",
  requireRole("AREA_MANAGER", "ADMIN"),
  ctrl.decideManager
);
// Stage 2: admin only.
router.post(
  "/:id/decide-admin",
  requireRole("ADMIN"),
  ctrl.decideAdmin
);

export default router;
