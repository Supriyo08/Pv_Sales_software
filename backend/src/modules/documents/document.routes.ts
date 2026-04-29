import { Router } from "express";
import * as ctrl from "./document.controller";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.listForOwner);
router.post("/", ctrl.create);

export default router;
