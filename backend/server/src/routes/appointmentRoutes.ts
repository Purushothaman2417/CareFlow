import { Router } from "express";

import {
  createAppointment,
  getMyAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  cancelAppointment,
  rescheduleAppointment,
} from "../controllers/appointmentController";

import { protect } from "../middleware/authMiddleware";

const router = Router();

router.post(
  "/",
  protect,
  createAppointment
);

router.get(
  "/",
  protect,
  getMyAppointments
);

router.get(
  "/:id",
  protect,
  getAppointmentById
);

router.patch(
  "/:id/status",
  protect,
  updateAppointmentStatus
);

router.patch(
  "/:id/cancel",
  protect,
  cancelAppointment
);

router.patch(
  "/:id/reschedule",
  protect,
  rescheduleAppointment
);

export default router;