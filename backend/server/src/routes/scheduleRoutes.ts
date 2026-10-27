import { Router } from "express";

import {
  createSchedule,
  getMySchedules,
  updateSchedule,
  deleteSchedule,
} from "../controllers/scheduleController";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware";

const router = Router();

router.post(
  "/",
  protect,
  authorize("doctor"),
  createSchedule
);

router.get(
  "/my",
  protect,
  authorize("doctor"),
  getMySchedules
);

router.put(
  "/:id",
  protect,
  authorize("doctor"),
  updateSchedule
);

router.delete(
  "/:id",
  protect,
  authorize("doctor"),
  deleteSchedule
);

export default router;