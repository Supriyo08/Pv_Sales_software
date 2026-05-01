import { Router } from "express";
import * as ctrl from "./installation.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/:id/transition", requireRole("ADMIN", "AREA_MANAGER"), ctrl.transition);
// Per Review 1.1 §7.
router.post("/:id/cancel", requireRole("ADMIN", "AREA_MANAGER"), ctrl.cancel);

export default router;
