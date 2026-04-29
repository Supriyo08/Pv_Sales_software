import { Router } from "express";
import * as ctrl from "./bonus.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/run", requireRole("ADMIN"), ctrl.run);
router.post("/run-monthly", requireRole("ADMIN"), ctrl.run);
router.post("/recalc/period/:period", requireRole("ADMIN"), ctrl.recalcPeriod);

export default router;
