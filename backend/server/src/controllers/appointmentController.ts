import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { Appointment } from "../models/Appointment";
import { Doctor } from "../models/Doctor";
import { DoctorSchedule } from "../models/DoctorSchedule";
import { User } from "../models/User";
import { AuthRequest } from "../middleware/authMiddleware";
import { createNotification } from "../services/notificationService";
import {
  formatTime,
  isPastSlot,
  parseDateOnly,
  scheduleContainsSlot,
  timeInMinutes,
} from "../services/scheduling";
import {
  cancelWaitingQueueEntry,
  hasActiveQueueEntry,
  restoreQueueEntry,
} from "../services/queueService";

const createAppointmentSchema = z
  .object({
    patientId: z.string().refine(mongoose.isValidObjectId).optional(),
    doctorId: z.string().refine(mongoose.isValidObjectId),
    appointmentDate: z.string(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    reason: z.string().trim().max(500).optional(),
    visitGoals: z.string().trim().max(1000).optional(),
    symptoms: z.string().trim().max(2000).optional(),
    allergies: z.string().trim().max(1000).optional(),
    medications: z.string().trim().max(1000).optional(),
    questions: z.string().trim().max(1000).optional(),
  })
  .strict();

const rescheduleAppointmentSchema = z
  .object({
    appointmentDate: z.string(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();

const appointmentStatusSchema = z
  .object({
    status: z.enum(["confirmed", "rejected"]),
    rejectionReason: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.status === "rejected" &&
      (!data.rejectionReason || !data.rejectionReason.trim())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rejection reason is required when rejecting an appointment",
        path: ["rejectionReason"],
      });
    }
  });

const ACTIVE_STATUSES = ["scheduled", "confirmed"] as const;

const isDuplicateKeyError = (
  error: unknown,
): error is { code: number } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

async function notifyAppointmentParties(
  appointment: {
    patientId: mongoose.Types.ObjectId;
    doctorId: mongoose.Types.ObjectId;
    appointmentDate: Date;
    startTime: string;
  },
  patientTitle: string,
  doctorTitle: string,
  message: string,
): Promise<boolean> {
  const doctor = await Doctor.findById(appointment.doctorId).select("userId");
  if (!doctor) return false;

  const results = await Promise.allSettled([
    createNotification({
      userId: appointment.patientId.toString(),
      title: patientTitle,
      message,
      type: "appointment",
    }),
    createNotification({
      userId: doctor.userId.toString(),
      title: doctorTitle,
      message,
      type: "appointment",
    }),
  ]);

  const failed = results.some((result) => result.status === "rejected");
  if (failed) {
    console.error("Appointment notification persistence failed");
  }
  return !failed;
}

async function resolveSlot(
  doctorId: mongoose.Types.ObjectId,
  dateString: string,
  startTime: string,
  excludeAppointmentId?: mongoose.Types.ObjectId,
) {
  const date = parseDateOnly(dateString);
  if (!date) {
    return { error: "Provide a valid appointment date in YYYY-MM-DD format" };
  }
  if (isPastSlot(dateString, startTime)) {
    return { error: "Appointment date and time must be in the future" };
  }

  const doctor = await Doctor.findById(doctorId).select("isAvailable");
  if (!doctor || !doctor.isAvailable) {
    return { error: "Doctor is currently unavailable" };
  }

  const schedule = await DoctorSchedule.findOne({
    doctorId,
    dayOfWeek: date.getUTCDay(),
    isAvailable: true,
    startTime: { $lte: startTime },
    endTime: { $gt: startTime },
  }).sort({ startTime: 1 });
  if (!schedule) return { error: "Doctor is not available at this time" };

  const endTime = formatTime(
    timeInMinutes(startTime) + schedule.slotDuration,
  );
  if (!scheduleContainsSlot(schedule, startTime, endTime)) {
    return {
      error: `Appointment must follow ${schedule.slotDuration}-minute schedule slots`,
    };
  }

  const existingAppointment = await Appointment.findOne({
    doctorId,
    appointmentDate: date,
    startTime,
    status: { $in: ACTIVE_STATUSES },
    ...(excludeAppointmentId ? { _id: { $ne: excludeAppointmentId } } : {}),
  }).select("_id");
  if (existingAppointment) {
    return { error: "This appointment slot is already booked" };
  }

  return { date, endTime };
}

function sendDuplicateSlot(res: Response): void {
  res.status(409).json({
    success: false,
    message: "This appointment slot is already booked",
  });
}

export const createAppointment = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }
  const isStaff =
    req.user.role === "receptionist" || req.user.role === "admin";
  if (req.user.role !== "patient" && !isStaff) {
    res.status(403).json({
      success: false,
      message: "Only patients and authorized staff can book appointments",
    });
    return;
  }

  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid appointment details",
    });
    return;
  }
  const {
    doctorId,
    appointmentDate,
    startTime,
    reason,
    visitGoals,
    symptoms,
    allergies,
    medications,
    questions,
    patientId: customPatientId,
  } = parsed.data;
  const date = parseDateOnly(appointmentDate);
  if (!date) {
    res.status(400).json({
      success: false,
      message: "Provide a valid appointment date in YYYY-MM-DD format",
    });
    return;
  }

  try {
    const targetPatientId =
      isStaff && customPatientId ? customPatientId : req.user.id;
    const patient = await User.findById(targetPatientId).select("_id role isActive");
    if (!patient || !patient.isActive) {
      res.status(404).json({
        success: false,
        message: "Active patient account not found",
      });
      return;
    }
    const doctorObjectId = new mongoose.Types.ObjectId(doctorId);
    const slot = await resolveSlot(doctorObjectId, appointmentDate, startTime);
    if ("error" in slot) {
      const status =
        slot.error === "This appointment slot is already booked" ? 409 : 400;
      res.status(status).json({ success: false, message: slot.error });
      return;
    }

    const appointment = await Appointment.create({
      patientId: patient._id,
      doctorId: doctorObjectId,
      appointmentDate: slot.date,
      startTime,
      endTime: slot.endTime,
      reason,
      visitGoals,
      symptoms,
      allergies,
      medications,
      questions,
      status: "scheduled",
      auditTrail: [
        {
          action: "Appointment requested",
          performedBy: new mongoose.Types.ObjectId(req.user.id),
          role: req.user.role,
          timestamp: new Date(),
          note: isStaff
            ? "Booked by receptionist/staff on behalf of patient"
            : "Requested directly by patient",
        },
      ],
    });
    const notificationSaved = await notifyAppointmentParties(
      appointment,
      "Appointment booked",
      "New appointment request",
      `An appointment is scheduled for ${appointmentDate} at ${startTime}.`,
    );

    res.status(201).json({
      success: true,
      message: notificationSaved
        ? "Appointment booked successfully"
        : "Appointment booked, but one or more notifications could not be saved",
      data: appointment,
      notificationSaved,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      sendDuplicateSlot(res);
      return;
    }
    console.error(
      "Create appointment error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to book appointment",
    });
  }
};

export const getMyAppointments = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    let filter: Record<string, unknown>;
    if (req.user.role === "patient") {
      filter = { patientId: req.user.id };
    } else if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
      if (!doctor) {
        res.status(404).json({
          success: false,
          message: "Doctor profile not found",
        });
        return;
      }
      filter = { doctorId: doctor._id };
    } else if (req.user.role === "admin" || req.user.role === "receptionist") {
      filter = {};
    } else {
      res.status(403).json({
        success: false,
        message: "You cannot access appointments",
      });
      return;
    }

    if (req.query.status && typeof req.query.status === "string") {
      filter.status = req.query.status;
    }
    if (
      req.query.doctorId &&
      typeof req.query.doctorId === "string" &&
      mongoose.isValidObjectId(req.query.doctorId)
    ) {
      filter.doctorId = new mongoose.Types.ObjectId(req.query.doctorId);
    }
    if (req.query.date && typeof req.query.date === "string") {
      const parsedDate = parseDateOnly(req.query.date);
      if (parsedDate) {
        filter.appointmentDate = parsedDate;
      }
    }

    const appointments = await Appointment.find(filter)
      .populate("patientId", "name email phone")
      .populate({
        path: "doctorId",
        select: "specialization qualification department",
        populate: { path: "userId", select: "name email phone" },
      })
      .sort({ appointmentDate: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error) {
    console.error(
      "Get appointments error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointments",
    });
  }
};

export const getAppointmentById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid appointment ID",
    });
    return;
  }

  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("patientId", "name")
      .populate({
        path: "doctorId",
        select: "specialization qualification",
        populate: { path: "userId", select: "name" },
      });

    if (!appointment) {
      res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
      return;
    }

    const patient = appointment.patientId as unknown as {
      _id: mongoose.Types.ObjectId;
    };
    const doctor = appointment.doctorId as unknown as {
      _id: mongoose.Types.ObjectId;
      userId: { _id: mongoose.Types.ObjectId };
    };
    const allowed =
      req.user.role === "admin" ||
      req.user.role === "receptionist" ||
      patient._id.toString() === req.user.id ||
      doctor.userId?._id.toString() === req.user.id;
    if (!allowed) {
      res.status(403).json({
        success: false,
        message: "You do not have access to this appointment",
      });
      return;
    }

    res.status(200).json({ success: true, data: appointment });
  } catch (error) {
    console.error(
      "Get appointment error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointment",
    });
  }
};

export const updateAppointmentStatus = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid appointment ID",
    });
    return;
  }
  const parsed = appointmentStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    const rejectionMessage = parsed.error.issues.find(
      (issue) => issue.path.includes("rejectionReason"),
    )?.message;
    res.status(400).json({
      success: false,
      message:
        rejectionMessage || "Only confirmed or rejected status updates are allowed",
    });
    return;
  }
  if (req.user.role !== "doctor") {
    res.status(403).json({
      success: false,
      message: "Only the assigned doctor can confirm or reject appointments",
    });
    return;
  }

  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
    if (!doctor) {
      res.status(404).json({
        success: false,
        message: "Doctor profile not found",
      });
      return;
    }
    const rejectionReason = parsed.data.rejectionReason?.trim();
    const updatePayload: Record<string, unknown> = {
      status: parsed.data.status,
    };
    if (parsed.data.status === "rejected" && rejectionReason) {
      updatePayload.rejectionReason = rejectionReason;
    }

    const appointment = await Appointment.findOneAndUpdate(
      {
        _id: req.params.id,
        doctorId: doctor._id,
        status: "scheduled",
      },
      {
        $set: updatePayload,
        $push: {
          auditTrail: {
            action: `Appointment ${parsed.data.status}`,
            performedBy: new mongoose.Types.ObjectId(req.user.id),
            role: req.user.role,
            timestamp: new Date(),
            note: rejectionReason,
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!appointment) {
      res.status(404).json({
        success: false,
        message: "Scheduled appointment not found",
      });
      return;
    }

    const patientMsg =
      parsed.data.status === "rejected" && rejectionReason
        ? `Your appointment on ${appointment.appointmentDate.toISOString().slice(0, 10)} at ${appointment.startTime} was rejected. Reason: ${rejectionReason}`
        : `Your appointment on ${appointment.appointmentDate.toISOString().slice(0, 10)} at ${appointment.startTime} was ${parsed.data.status}.`;

    const notificationSaved = await notifyAppointmentParties(
      appointment,
      `Appointment ${parsed.data.status}`,
      `Appointment ${parsed.data.status}`,
      patientMsg,
    );
    res.status(200).json({
      success: true,
      message: notificationSaved
        ? `Appointment ${parsed.data.status}`
        : `Appointment ${parsed.data.status}, but one or more notifications could not be saved`,
      data: appointment,
      notificationSaved,
    });
  } catch (error) {
    console.error(
      "Update appointment status error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to update appointment status",
    });
  }
};

export const cancelAppointment = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid appointment ID",
    });
    return;
  }

  try {
    const filter: Record<string, unknown> = {
      _id: req.params.id,
      status: { $in: ACTIVE_STATUSES },
    };
    if (req.user.role === "patient") {
      filter.patientId = req.user.id;
    } else if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
      if (!doctor) {
        res.status(404).json({
          success: false,
          message: "Doctor profile not found",
        });
        return;
      }
      filter.doctorId = doctor._id;
    } else if (req.user.role !== "admin" && req.user.role !== "receptionist") {
      res.status(403).json({
        success: false,
        message: "You cannot cancel appointments",
      });
      return;
    }

    const activeAppointment = await Appointment.findOne(filter).select("_id");
    if (!activeAppointment) {
      res.status(404).json({
        success: false,
        message: "Active appointment not found",
      });
      return;
    }

    const queueChange = await cancelWaitingQueueEntry(activeAppointment._id);
    if (queueChange.blocked) {
      res.status(409).json({
        success: false,
        message: "This appointment cannot be cancelled after the patient has been called",
      });
      return;
    }

    const appointment = await Appointment.findOneAndUpdate(
      { ...filter, _id: activeAppointment._id },
      {
        $set: { status: "cancelled" },
        $push: {
          auditTrail: {
            action: "Appointment cancelled",
            performedBy: new mongoose.Types.ObjectId(req.user.id),
            role: req.user.role,
            timestamp: new Date(),
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!appointment) {
      await restoreQueueEntry(queueChange.cancelledEntry);
      res.status(409).json({
        success: false,
        message: "Appointment changed before it could be cancelled. Refresh and try again.",
      });
      return;
    }

    const notificationSaved = await notifyAppointmentParties(
      appointment,
      "Appointment cancelled",
      "Appointment cancelled",
      `The appointment on ${appointment.appointmentDate.toISOString().slice(0, 10)} at ${appointment.startTime} was cancelled.`,
    );
    res.status(200).json({
      success: true,
      message: notificationSaved
        ? "Appointment cancelled successfully"
        : "Appointment cancelled, but one or more notifications could not be saved",
      data: appointment,
      notificationSaved,
    });
  } catch (error) {
    console.error(
      "Cancel appointment error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to cancel appointment",
    });
  }
};

export const rescheduleAppointment = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid appointment ID",
    });
    return;
  }
  const isAuthorizedToReschedule =
    req.user.role === "patient" ||
    req.user.role === "receptionist" ||
    req.user.role === "admin";
  if (!isAuthorizedToReschedule) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to reschedule appointments",
    });
    return;
  }
  const parsed = rescheduleAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Provide a valid date and time",
    });
    return;
  }

  try {
    const queryFilter: Record<string, unknown> = {
      _id: req.params.id,
      status: { $in: ACTIVE_STATUSES },
    };
    if (req.user.role === "patient") {
      queryFilter.patientId = req.user.id;
    }

    const appointment = await Appointment.findOne(queryFilter);
    if (!appointment) {
      res.status(404).json({
        success: false,
        message: "Active appointment not found",
      });
      return;
    }

    if (await hasActiveQueueEntry(appointment._id)) {
      res.status(409).json({
        success: false,
        message: "A checked-in appointment cannot be rescheduled. Cancel it and request a new appointment time.",
      });
      return;
    }

    const slot = await resolveSlot(
      appointment.doctorId,
      parsed.data.appointmentDate,
      parsed.data.startTime,
      appointment._id,
    );
    if ("error" in slot) {
      res.status(
        slot.error === "This appointment slot is already booked" ? 409 : 400,
      ).json({ success: false, message: slot.error });
      return;
    }

    const updatedAppointment = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        patientId: appointment.patientId,
        status: { $in: ACTIVE_STATUSES },
      },
      {
        $set: {
          appointmentDate: slot.date,
          startTime: parsed.data.startTime,
          endTime: slot.endTime,
        },
        $push: {
          auditTrail: {
            action: `Rescheduled to ${parsed.data.appointmentDate} ${parsed.data.startTime}`,
            performedBy: new mongoose.Types.ObjectId(req.user.id),
            role: req.user.role,
            timestamp: new Date(),
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!updatedAppointment) {
      res.status(409).json({
        success: false,
        message: "Appointment is no longer active",
      });
      return;
    }
    const notificationSaved = await notifyAppointmentParties(
      updatedAppointment,
      "Appointment rescheduled",
      "Appointment rescheduled",
      `The appointment was rescheduled to ${parsed.data.appointmentDate} at ${parsed.data.startTime}.`,
    );

    res.status(200).json({
      success: true,
      message: notificationSaved
        ? "Appointment rescheduled successfully"
        : "Appointment rescheduled, but one or more notifications could not be saved",
      data: updatedAppointment,
      notificationSaved,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      sendDuplicateSlot(res);
      return;
    }
    console.error(
      "Reschedule appointment error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to reschedule appointment",
    });
  }
};
