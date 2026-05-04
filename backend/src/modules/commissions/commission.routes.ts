import { Router } from "express";
import * as ctrl from "./commission.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
// Per Review 1.2 (2026-05-04): potential-earnings breakdown.
router.get("/breakdown/me", ctrl.breakdownForMe);
router.get("/breakdown/user/:userId", ctrl.breakdownForUser);
router.get("/user/:userId", ctrl.listForUser);
router.post("/recalc/contract/:id", requireRole("ADMIN"), ctrl.recalcContract);
router.post("/recalc/solution/:id", requireRole("ADMIN"), ctrl.recalcSolution);

export default router;
