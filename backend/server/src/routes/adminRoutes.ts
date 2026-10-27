import { Router } from "express";

import {
  getStaffList,
  updateStaffStatus,
  createStaffMember,
  getOperationalReports,
  getAuditLogs,
} from "../controllers/adminController";
import { protect, authorize } from "../middleware/authMiddleware";

const router = Router();

// Staff list accessible to admin and receptionist (for lookup)
router.get("/staff", protect, getStaffList);

// Admin-only actions
router.patch("/staff/:id/status", protect, authorize("admin"), updateStaffStatus);
router.post("/staff", protect, authorize("admin"), createStaffMember);
router.get("/reports", protect, authorize("admin"), getOperationalReports);
router.get("/audit-logs", protect, authorize("admin"), getAuditLogs);

export default router;
