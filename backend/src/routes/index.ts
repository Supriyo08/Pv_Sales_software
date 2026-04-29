import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import userRoutes from "../modules/users/user.routes";
import territoryRoutes from "../modules/territories/territory.routes";
import catalogRoutes from "../modules/catalog/catalog.routes";
import customerRoutes from "../modules/customers/customer.routes";
import leadRoutes from "../modules/leads/lead.routes";
import contractRoutes from "../modules/contracts/contract.routes";
import installationRoutes from "../modules/installations/installation.routes";
import documentRoutes from "../modules/documents/document.routes";
import commissionRoutes from "../modules/commissions/commission.routes";
import bonusRoutes from "../modules/bonuses/bonus.routes";
import paymentRoutes from "../modules/payments/payment.routes";
import reportRoutes from "../modules/reports/report.routes";
import notificationRoutes from "../modules/notifications/notification.routes";
import auditRoutes from "../modules/audit/audit.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/territories", territoryRoutes);
router.use("/catalog", catalogRoutes);
router.use("/customers", customerRoutes);
router.use("/leads", leadRoutes);
router.use("/contracts", contractRoutes);
router.use("/installations", installationRoutes);
router.use("/documents", documentRoutes);
router.use("/commissions", commissionRoutes);
router.use("/bonuses", bonusRoutes);
router.use("/payments", paymentRoutes);
router.use("/reports", reportRoutes);
router.use("/notifications", notificationRoutes);
router.use("/audit-logs", auditRoutes);

export default router;
