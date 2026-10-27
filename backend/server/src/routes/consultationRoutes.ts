import { Router } from "express";

import {
  createConsultation,
  getMyConsultations,
  getConsultationById,
  getPatientMedicalHistory,
} from "../controllers/consultationController";

import { protect } from "../middleware/authMiddleware";

const router = Router();

router.post("/", protect, createConsultation);

router.get("/", protect, getMyConsultations);
router.get(
  "/history/:patientId",
  protect,
  getPatientMedicalHistory
);

router.get("/:id", protect, getConsultationById);

export default router;