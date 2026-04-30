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
router.patch(
  "/solutions/:id/versions/:versionId",
  requireRole("ADMIN"),
  ctrl.updateVersion
);

router.get("/installment-plans", ctrl.listInstallmentPlans);
router.post("/installment-plans", requireRole("ADMIN"), ctrl.createInstallmentPlan);
router.patch(
  "/installment-plans/:id",
  requireRole("ADMIN"),
  ctrl.updateInstallmentPlan
);
router.delete(
  "/installment-plans/:id",
  requireRole("ADMIN"),
  ctrl.deleteInstallmentPlan
);

router.get("/bonus-rules", ctrl.listBonusRules);
router.post("/bonus-rules", requireRole("ADMIN"), ctrl.createBonusRule);
router.delete("/bonus-rules/:id", requireRole("ADMIN"), ctrl.deleteBonusRule);

export default router;
