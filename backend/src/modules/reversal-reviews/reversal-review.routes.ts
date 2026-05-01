import { Router } from "express";
import * as ctrl from "./reversal-review.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", requireRole("ADMIN"), ctrl.list);
router.get("/pending-count", requireRole("ADMIN"), ctrl.pendingCount);
router.get("/:id", requireRole("ADMIN"), ctrl.get);
router.post("/:id/decide", requireRole("ADMIN"), ctrl.decide);

export default router;
