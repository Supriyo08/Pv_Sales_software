import { Router } from "express";
import * as ctrl from "./catalog.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/solutions", ctrl.listSolutions);
router.post("/solutions", requireRole("ADMIN"), ctrl.createSolution);
router.get("/solutions/:id", ctrl.getSolution);
// Per Review 1.1 §3: deactivate / activate / archive whole solution.
router.patch("/solutions/:id/active", requireRole("ADMIN"), ctrl.setSolutionActive);
router.post("/solutions/:id/archive", requireRole("ADMIN"), ctrl.archiveSolution);
router.post("/solutions/:id/unarchive", requireRole("ADMIN"), ctrl.unarchiveSolution);
router.get("/solutions/:id/versions", ctrl.listVersions);
router.get("/solutions/:id/versions/active", ctrl.activeVersion);
router.post("/solutions/:id/versions", requireRole("ADMIN"), ctrl.createVersion);
router.post("/solutions/:id/version", requireRole("ADMIN"), ctrl.createVersion);
router.patch(
  "/solutions/:id/versions/:versionId",
  requireRole("ADMIN"),
  ctrl.updateVersion
);
router.get("/solution-versions/:id", ctrl.getVersion);

router.get("/installment-plans", ctrl.listInstallmentPlans);
router.post("/installment-plans", requireRole("ADMIN"), ctrl.createInstallmentPlan);
router.get("/installment-plans/:id", ctrl.getInstallmentPlan);
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
