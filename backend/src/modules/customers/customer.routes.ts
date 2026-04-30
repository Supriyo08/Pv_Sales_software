import { Router } from "express";
import * as ctrl from "./customer.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.get);
router.patch("/:id", ctrl.update);
router.patch("/:id/assign", requireRole("ADMIN", "AREA_MANAGER"), ctrl.reassign);
router.delete("/:id", requireRole("ADMIN"), ctrl.remove);

export default router;
