import { Router } from "express";

import {
  protect,
  authorize,
} from "../middleware/authMiddleware";

const router = Router();

router.get(
  "/patient",
  protect,
  authorize("patient"),
  (_req, res) => {
    res.json({
      success: true,
      message: "Patient access granted",
    });
  }
);

router.get(
  "/doctor",
  protect,
  authorize("doctor"),
  (_req, res) => {
    res.json({
      success: true,
      message: "Doctor access granted",
    });
  }
);

router.get(
  "/admin",
  protect,
  authorize("admin"),
  (_req, res) => {
    res.json({
      success: true,
      message: "Admin access granted",
    });
  }
);

router.get(
  "/receptionist",
  protect,
  authorize("receptionist"),
  (_req, res) => {
    res.json({
      success: true,
      message: "Receptionist access granted",
    });
  }
);

export default router;