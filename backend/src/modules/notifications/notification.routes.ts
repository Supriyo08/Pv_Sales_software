import { Router } from "express";
import * as ctrl from "./notification.controller";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.get("/unread-count", ctrl.unreadCount);
router.patch("/:id/read", ctrl.markRead);

export default router;
