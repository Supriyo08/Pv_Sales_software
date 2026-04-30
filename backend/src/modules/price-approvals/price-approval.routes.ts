import { Router } from "express";
import * as ctrl from "./price-approval.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.get);
router.post("/:id/approve", requireRole("ADMIN", "AREA_MANAGER"), ctrl.approve);
router.post("/:id/reject", requireRole("ADMIN", "AREA_MANAGER"), ctrl.reject);
router.post("/:id/cancel", ctrl.cancel);

export default router;
