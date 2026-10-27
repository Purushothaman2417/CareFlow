import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { Consultation } from "../models/Consultation";
import { Appointment } from "../models/Appointment";
import { Doctor } from "../models/Doctor";
import { AuthRequest } from "../middleware/authMiddleware";
import { createNotification } from "../services/notificationService";
import QueueEntry from "../models/QueueEntry";
import { dateKey, isPastSlot, parseDateOnly } from "../services/scheduling";
import { emitQueueUpdate } from "../sockets/socket";

const createConsultationSchema = z
  .object({
    appointmentId: z.string().refine(mongoose.isValidObjectId),
    symptoms: z.string().trim().max(2000).optional(),
    diagnosis: z.string().trim().min(1).max(1000),
    prescription: z.string().trim().max(3000).optional(),
    notes: z.string().trim().max(3000).optional(),
    followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

// =====================================================
// CREATE CONSULTATION
// POST /api/consultations
// =====================================================

export const createConsultation = async (
  req: AuthRequest,
  res: Response
) => {
  if (req.user?.role !== "doctor") {
    res.status(403).json({
      success: false,
      message: "Only doctors can create consultations",
    });
    return;
  }

  const parsed = createConsultationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Provide a valid appointment and diagnosis",
    });
    return;
  }

  const parsedFollowUpDate = parsed.data.followUpDate
    ? parseDateOnly(parsed.data.followUpDate)
    : undefined;
  if (parsed.data.followUpDate && !parsedFollowUpDate) {
    res.status(400).json({
      success: false,
      message: "Provide a valid follow-up date in YYYY-MM-DD format",
    });
    return;
  }
  const followUpDate = parsedFollowUpDate ?? undefined;

  try {
    const appointment = await Appointment.findById(parsed.data.appointmentId);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const doctor = await Doctor.findOne({
      userId: req.user.id,
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor profile not found",
      });
    }

    if (appointment.doctorId.toString() !== doctor._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only manage your own appointments",
      });
    }

    if (appointment.status !== "confirmed") {
      return res.status(400).json({
        success: false,
        message: "Only confirmed appointments can have consultations",
      });
    }

    if (
      !isPastSlot(
        dateKey(appointment.appointmentDate),
        appointment.startTime,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "A consultation can only be recorded after the appointment starts",
      });
    }

    const existingConsultation = await Consultation.findOne({
      appointmentId: appointment._id,
    });

    if (existingConsultation) {
      return res.status(400).json({
        success: false,
        message: "Consultation already exists for this appointment",
        consultation: existingConsultation,
      });
    }

    const consultation = await Consultation.create({
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      doctorId: doctor._id,
      symptoms: parsed.data.symptoms,
      diagnosis: parsed.data.diagnosis,
      prescription: parsed.data.prescription,
      notes: parsed.data.notes,
      followUpDate,
    });

    appointment.status = "completed";
    appointment.auditTrail = appointment.auditTrail || [];
    appointment.auditTrail.push({
      action: "Consultation completed",
      performedBy: new mongoose.Types.ObjectId(req.user.id),
      role: req.user.role,
      timestamp: new Date(),
      note: `Diagnosis: ${parsed.data.diagnosis}`,
    });
    await appointment.save();
    const queueEntry = await QueueEntry.findOneAndUpdate(
      {
        appointmentId: appointment._id,
        status: { $in: ["waiting", "called", "in_consultation"] },
      },
      { $set: { status: "completed", completedAt: new Date() } },
      { new: true },
    );
    if (queueEntry) emitQueueUpdate("PATIENT_COMPLETED", queueEntry);
    await createNotification({
      userId: appointment.patientId.toString(),
      title: "Consultation Completed",
      message: "Your consultation summary is now available in your medical records.",
      type: "consultation",
    });

    return res.status(201).json({
      success: true,
      message: "Consultation created successfully",
      consultation,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return res.status(409).json({
        success: false,
        message: "A consultation already exists for this appointment",
      });
    }
    console.error(
      "Create consultation error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create consultation",
    });
  }
};

// =====================================================
// GET MY CONSULTATIONS
// GET /api/consultations
// =====================================================

export const getMyConsultations = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role === "patient") {
      const consultations = await Consultation.find({
        patientId: req.user.id,
      })
        .populate({
          path: "doctorId",
          select: "userId specialization",
          populate: { path: "userId", select: "name" },
        })
        .populate("appointmentId")
        .sort({ createdAt: -1 });

      return res.json({
        success: true,
        count: consultations.length,
        data: consultations,
      });
    }

    if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({
        userId: req.user.id,
      });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: "Doctor profile not found",
        });
      }

      const consultations = await Consultation.find({
        doctorId: doctor._id,
      })
        .populate("patientId", "name email phone")
        .populate("appointmentId")
        .sort({ createdAt: -1 });

      return res.json({
        success: true,
        count: consultations.length,
        data: consultations,
      });
    }

    return res.status(403).json({
      success: false,
      message: "Access denied",
    });
  } catch (error) {
    console.error("Get consultations error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get consultations",
    });
  }
};

// =====================================================
// GET CONSULTATION BY ID
// GET /api/consultations/:id
// =====================================================

export const getConsultationById = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid consultation ID",
      });
    }
    const consultation = await Consultation.findById(id);

    if (!consultation) {
      return res.status(404).json({
        success: false,
        message: "Consultation not found",
      });
    }

    const patientId = consultation.patientId.toString();
    const doctor = await Doctor.findById(consultation.doctorId);
    const doctorUserId = doctor?.userId.toString();

    const isPatient =
      req.user?.id === patientId;

    const isDoctor =
      req.user?.id === doctorUserId;

    const isAdmin =
      req.user?.role === "admin";

    if (!isPatient && !isDoctor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this consultation",
      });
    }

    await consultation.populate([
      { path: "patientId", select: "name email phone" },
      {
        path: "doctorId",
        select: "userId specialization",
        populate: { path: "userId", select: "name" },
      },
      { path: "appointmentId" },
    ]);

    return res.json({
      success: true,
      consultation,
    });
  } catch (error) {
    console.error("Get consultation error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get consultation",
    });
  }
};
// =====================================================
// GET PATIENT MEDICAL HISTORY
// GET /api/consultations/history/:patientId
// =====================================================

export const getPatientMedicalHistory = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { patientId } = req.params;
    if (!mongoose.isValidObjectId(patientId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID",
      });
    }

    const isOwnHistory = req.user.id === patientId;
    const isAdmin = req.user.role === "admin";

    let isTreatingDoctor = false;
    if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: "Doctor profile not found",
        });
      }
      isTreatingDoctor = !!(await Appointment.exists({
        doctorId: doctor._id,
        patientId,
        status: { $in: ["scheduled", "confirmed", "completed"] },
      }));
    }

    if (!isOwnHistory && !isAdmin && !isTreatingDoctor) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this medical history",
      });
    }

    const consultations = await Consultation.find({
      patientId,
    })
      .populate({
        path: "doctorId",
        select: "userId specialization",
        populate: { path: "userId", select: "name" },
      })
      .populate("appointmentId")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      patientId,
      count: consultations.length,
      history: consultations,
    });
  } catch (error) {
    console.error("Medical history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get medical history",
    });
  }
};