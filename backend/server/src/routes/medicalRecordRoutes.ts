import { Router } from "express";

import {
  createMedicalRecord,
  getMedicalRecords,
} from "../controllers/medicalRecordController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.get("/", protect, getMedicalRecords);
router.post("/", protect, createMedicalRecord);

export default router;
