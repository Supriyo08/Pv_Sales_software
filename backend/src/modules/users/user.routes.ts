import { Router } from "express";
import * as ctrl from "./user.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();

router.use(requireAuth);
router.get("/me", ctrl.me);
router.get("/", requireRole("ADMIN"), ctrl.list);
router.post("/", requireRole("ADMIN"), ctrl.create);
router.get("/:id", requireRole("ADMIN"), ctrl.get);
router.get("/:id/profile", requireRole("ADMIN", "AREA_MANAGER"), ctrl.profile);
router.patch("/:id", requireRole("ADMIN"), ctrl.update);
router.delete("/:id", requireRole("ADMIN"), ctrl.remove);
// Per Review 1.1 §5.
router.post("/:id/reactivate", requireRole("ADMIN"), ctrl.reactivate);
router.post("/:id/reset-password", requireRole("ADMIN"), ctrl.resetPassword);

export default router;
