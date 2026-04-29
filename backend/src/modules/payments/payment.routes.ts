import { Router } from "express";
import * as ctrl from "./payment.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", requireRole("ADMIN"), ctrl.create);
router.get("/:id", ctrl.get);
router.get("/:id/transactions", ctrl.listTransactions);
router.post("/:id/transactions", requireRole("ADMIN"), ctrl.addTransaction);
router.post("/:id/cancel", requireRole("ADMIN"), ctrl.cancel);

export default router;
