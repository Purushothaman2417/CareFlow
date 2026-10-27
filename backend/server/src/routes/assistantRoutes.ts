import { Router } from "express";

import { askAssistant } from "../controllers/assistantController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

router.post("/", protect, askAssistant);

export default router;
