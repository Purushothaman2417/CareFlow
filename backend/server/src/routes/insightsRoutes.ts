import { Router } from "express";

import { getInsights } from "../controllers/insightsController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.get("/", protect, getInsights);

export default router;
