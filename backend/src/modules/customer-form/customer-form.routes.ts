import { Router } from "express";
import * as ctrl from "./customer-form.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.get);
router.put("/", requireRole("ADMIN"), ctrl.update);

export default router;
