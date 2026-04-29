import { Router } from "express";
import * as ctrl from "./catalog.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/solutions", ctrl.listSolutions);
router.post("/solutions", requireRole("ADMIN"), ctrl.createSolution);
router.get("/solutions/:id/versions", ctrl.listVersions);
router.get("/solutions/:id/versions/active", ctrl.activeVersion);
router.post("/solutions/:id/versions", requireRole("ADMIN"), ctrl.createVersion);
router.post("/solutions/:id/version", requireRole("ADMIN"), ctrl.createVersion);

router.get("/bonus-rules", ctrl.listBonusRules);
router.post("/bonus-rules", requireRole("ADMIN"), ctrl.createBonusRule);

export default router;
