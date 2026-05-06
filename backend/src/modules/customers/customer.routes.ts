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
// Per Review 1.5 (2026-05-04): customer notes chat — anyone visible to the
// customer can post; admins/AMs/agents all read.
router.get("/:id/notes", ctrl.listNotes);
router.post("/:id/notes", ctrl.createNote);

export default router;
