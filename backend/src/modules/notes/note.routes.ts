import { Router } from "express";
import * as ctrl from "./note.controller";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);

export default router;
