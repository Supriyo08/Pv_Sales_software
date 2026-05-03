import { Router } from "express";
import * as ctrl from "./payment.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
// Per Review 1.2 (2026-05-04): chronological ledger + top-of-page summary.
// Mounted before `/:id` so the literal segments win.
router.get("/ledger", ctrl.ledger);
router.get("/summary", ctrl.summary);
router.post("/", requireRole("ADMIN"), ctrl.create);
router.get("/:id", ctrl.get);
router.get("/:id/transactions", ctrl.listTransactions);
router.post("/:id/transactions", requireRole("ADMIN"), ctrl.addTransaction);
router.post("/:id/cancel", requireRole("ADMIN"), ctrl.cancel);

export default router;
