import { Router } from "express";
import * as ctrl from "./lead.controller";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.get);
router.post("/:id/transition", ctrl.transition);

export default router;
