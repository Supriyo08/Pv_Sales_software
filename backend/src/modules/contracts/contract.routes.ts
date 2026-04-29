import { Router } from "express";
import * as ctrl from "./contract.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.get);
router.post("/:id/sign", requireRole("ADMIN", "AREA_MANAGER"), ctrl.sign);
router.post("/:id/cancel", requireRole("ADMIN", "AREA_MANAGER"), ctrl.cancel);

export default router;
