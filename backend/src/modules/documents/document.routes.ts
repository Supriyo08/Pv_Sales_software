import { Router } from "express";
import * as ctrl from "./document.controller";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.listForOwner);
router.post("/", ctrl.create);
router.post("/upload", ctrl.uploadMiddleware, ctrl.upload);

export default router;
