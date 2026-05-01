import { Router } from "express";
import * as ctrl from "./advance-pay-auth.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.get("/pending-count", ctrl.pendingCount);
router.get("/:id", ctrl.get);
router.post("/:id/decide", requireRole("ADMIN", "AREA_MANAGER"), ctrl.decide);

export default router;
