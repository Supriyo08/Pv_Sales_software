import { Router } from "express";
import * as ctrl from "./audit.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);
router.use(requireRole("ADMIN"));

router.get("/", ctrl.list);

export default router;
