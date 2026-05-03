import { Router } from "express";
import * as ctrl from "./template.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/:id/render", ctrl.render);
// Per follow-up to Review 1.1 (round 2, 2026-05-02): live .docx preview.
router.post("/:id/render-docx", ctrl.renderDocx);
router.post("/", requireRole("ADMIN"), ctrl.create);
router.post("/upload", requireRole("ADMIN"), ctrl.uploadMiddleware, ctrl.upload);
router.patch("/:id", requireRole("ADMIN"), ctrl.update);
router.delete("/:id", requireRole("ADMIN"), ctrl.remove);
// Per Review 1.2 (2026-05-04): restore an archived template.
router.post("/:id/restore", requireRole("ADMIN"), ctrl.restore);
// Per Review 1.2 (2026-05-04): version history (audit-driven).
router.get("/:id/history", requireRole("ADMIN", "AREA_MANAGER"), ctrl.history);

export default router;
