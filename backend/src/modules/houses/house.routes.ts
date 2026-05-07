import { Router } from "express";
import * as ctrl from "./house.controller";
import { requireAuth } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

// All routes are scoped to the calling user; agents see only their own
// customers' houses, AMs see their network, admins see everything.
router.get("/customer/:customerId", ctrl.listForCustomer);
router.get("/:id", ctrl.get);
router.post("/", ctrl.create);
router.patch("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

export default router;
