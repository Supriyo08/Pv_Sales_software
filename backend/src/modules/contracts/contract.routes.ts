import { Router } from "express";
import * as ctrl from "./contract.controller";
import * as editRequestCtrl from "../contract-edit-requests/contract-edit-request.controller";
import { requireAuth, requireRole } from "../../middleware/auth";

const router = Router();
router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.get);
// Per Review 1.2 (2026-05-04).
router.get("/:id/history", ctrl.history);
router.post("/:id/sign", ctrl.sign); // agent action — signing the contract with the customer
router.post("/:id/upload-signed", ctrl.attachSignedScan); // agent uploads signed scan
router.post("/:id/approve", requireRole("ADMIN", "AREA_MANAGER"), ctrl.approve);
router.post("/:id/cancel", requireRole("ADMIN", "AREA_MANAGER"), ctrl.cancel);

// Per Review 1.1 §1: agent generates the contract PDF; admin/AM approves it
// before agent can sign/print. Generation gate is enforced server-side in sign().
router.post("/:id/generate", ctrl.generate);
router.post(
  "/:id/approve-generated",
  requireRole("ADMIN", "AREA_MANAGER"),
  ctrl.approveGenerated
);

// Per Review 1.5 follow-up (2026-05-07): byte-perfect PDF download — converts
// the generated .docx to PDF on the server using headless LibreOffice. Falls
// back gracefully (503 + LIBREOFFICE_UNAVAILABLE code) if soffice isn't on
// the host, so the frontend can switch to its rasterised PDF.
router.get("/:id/generated.pdf", ctrl.downloadGeneratedPdf);

// Per Review 1.1 §1: agent (or admin) submits an edit request; admin/AM applies it.
router.post("/:id/edit-requests", editRequestCtrl.create);

export default router;
