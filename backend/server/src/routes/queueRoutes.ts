import { Router } from "express";

import {
  checkInPatient,
  getMyQueueEntries,
  getTodayQueue,
  callNextPatient,
  startConsultationVisit,
  skipPatient,
  requeuePatient,
  getHospitalQueues,
} from "../controllers/queueController";

import { protect } from "../middleware/authMiddleware";

const router = Router();

router.post("/check-in", protect, checkInPatient);
router.get("/mine", protect, getMyQueueEntries);
router.get("/today", protect, getTodayQueue);
router.get("/hospital", protect, getHospitalQueues);
router.post("/call-next", protect, callNextPatient);
router.post("/start-visit", protect, startConsultationVisit);
router.post("/skip", protect, skipPatient);
router.post("/requeue", protect, requeuePatient);

export default router;
