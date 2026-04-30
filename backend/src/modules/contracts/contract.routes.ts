import { Router } from "express";
import * as ctrl from "./contract.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.get);
router.post("/:id/sign", ctrl.sign); // agent action — signing the contract with the customer
router.post("/:id/upload-signed", ctrl.attachSignedScan); // agent uploads signed scan
router.post("/:id/approve", requireRole("ADMIN", "AREA_MANAGER"), ctrl.approve);
router.post("/:id/cancel", requireRole("ADMIN", "AREA_MANAGER"), ctrl.cancel);

export default router;
