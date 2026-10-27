import { Router } from "express";

import {
  createCarePlan,
  getCarePlans,
  toggleMedicationTaken,
  updateCarePlanTask,
} from "../controllers/carePlanController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.get("/", protect, getCarePlans);
router.post("/", protect, createCarePlan);
router.patch("/:id/tasks/:taskId", protect, updateCarePlanTask);
router.patch("/:id/medications/:medicationId/taken", protect, toggleMedicationTaken);

export default router;
