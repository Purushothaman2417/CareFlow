import { Router } from "express";

import {
  createDoctor,
  getDoctors,
  getDoctorById,
  getMyDoctorProfile,
  updateDoctor,
  getDepartments,
} from "../controllers/doctorController";
import { getDoctorSlots } from "../controllers/scheduleController";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware";

const router = Router();

// Anyone logged in can view doctors and departments
router.get("/", protect, getDoctors);
router.get("/departments", protect, getDepartments);
router.get("/:id/slots", protect, getDoctorSlots);

// Only doctors can create/update their profile
router.get(
  "/profile",
  protect,
  authorize("doctor"),
  getMyDoctorProfile
);

router.post(
  "/profile",
  protect,
  authorize("doctor"),
  createDoctor
);

router.patch(
  "/profile",
  protect,
  authorize("doctor"),
  updateDoctor
);

router.get("/:id", protect, getDoctorById);

export default router;