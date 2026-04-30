import { Router } from "express";
import * as ctrl from "./pricing.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/:id/quote", ctrl.quote);
router.post("/", requireRole("ADMIN"), ctrl.create);
router.patch("/:id", requireRole("ADMIN"), ctrl.update);
router.delete("/:id", requireRole("ADMIN"), ctrl.remove);

export default router;
