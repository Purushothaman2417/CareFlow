import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { Appointment } from "../models/Appointment";
import { Doctor } from "../models/Doctor";
import { MedicalRecord } from "../models/MedicalRecord";
import { AuthRequest } from "../middleware/authMiddleware";

const createRecordSchema = z
  .object({
    patientId: z.string().refine(mongoose.isValidObjectId).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    recordedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

function parseDateOnly(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export const getMedicalRecords = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  if (!["patient", "doctor", "admin"].includes(req.user.role)) {
    res.status(403).json({ success: false, message: "Access denied" });
    return;
  }

  try {
    let filter: Record<string, unknown>;
    if (req.user.role === "patient") {
      filter = { patientId: req.user.id };
    } else if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
      if (!doctor) {
        res.status(404).json({ success: false, message: "Doctor profile not found" });
        return;
      }
      const appointments = await Appointment.find({
        doctorId: doctor._id,
        status: { $in: ["scheduled", "confirmed", "completed"] },
      }).distinct("patientId");
      filter = { patientId: { $in: appointments } };
    } else {
      filter = {};
    }

    const records = await MedicalRecord.find(filter)
      .populate("patientId", "name")
      .populate({
        path: "doctorId",
        select: "userId specialization",
        populate: { path: "userId", select: "name" },
      })
      .sort({ recordedAt: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    console.error(
      "Get medical records error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch medical records",
    });
  }
};

export const createMedicalRecord = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  const parsed = createRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid medical record fields" });
    return;
  }
  const recordedAt = parseDateOnly(parsed.data.recordedAt);
  if (!recordedAt) {
    res.status(400).json({
      success: false,
      message: "Provide a valid record date in YYYY-MM-DD format",
    });
    return;
  }

  try {
    let patientId: mongoose.Types.ObjectId;
    let doctorId: mongoose.Types.ObjectId | undefined;

    if (req.user.role === "patient") {
      if (parsed.data.patientId && parsed.data.patientId !== req.user.id) {
        res.status(403).json({
          success: false,
          message: "Patients can only add records to their own history",
        });
        return;
      }
      patientId = new mongoose.Types.ObjectId(req.user.id);
    } else if (req.user.role === "doctor") {
      if (!parsed.data.patientId) {
        res.status(400).json({ success: false, message: "Patient ID is required" });
        return;
      }
      const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
      if (!doctor) {
        res.status(404).json({ success: false, message: "Doctor profile not found" });
        return;
      }
      const relationship = await Appointment.exists({
        doctorId: doctor._id,
        patientId: parsed.data.patientId,
        status: { $in: ["scheduled", "confirmed", "completed"] },
      });
      if (!relationship) {
        res.status(403).json({
          success: false,
          message: "You can only add records for your own patients",
        });
        return;
      }
      patientId = new mongoose.Types.ObjectId(parsed.data.patientId);
      doctorId = doctor._id;
    } else {
      res.status(403).json({ success: false, message: "Access denied" });
      return;
    }

    const record = await MedicalRecord.create({
      patientId,
      doctorId,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      recordedAt,
    });

    res.status(201).json({
      success: true,
      message: "Medical record added successfully",
      data: record,
    });
  } catch (error) {
    console.error(
      "Create medical record error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to add medical record",
    });
  }
};
