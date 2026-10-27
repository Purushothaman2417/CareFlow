import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { Appointment } from "../models/Appointment";
import { Doctor } from "../models/Doctor";
import { DoctorSchedule } from "../models/DoctorSchedule";
import { AuthRequest } from "../middleware/authMiddleware";
import {
  clinicDateKey,
  dateKey,
  isPastSlot,
  parseDateOnly,
  scheduleContainsSlot,
  schedulesOverlap,
  timeInMinutes,
  formatTime,
} from "../services/scheduling";

const scheduleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    slotDuration: z.number().int().min(5).max(120).default(30),
    isAvailable: z.boolean().default(true),
  })
  .strict()
  .refine(
    ({ startTime, endTime }) =>
      timeInMinutes(endTime) > timeInMinutes(startTime),
    { message: "End time must be after start time" },
  );

const isDuplicateKeyError = (
  error: unknown,
): error is { code: number } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

async function getDoctorForUser(userId: string) {
  return Doctor.findOne({ userId });
}

async function conflictsWithSchedule(
  doctorId: mongoose.Types.ObjectId,
  schedule: Pick<
    z.infer<typeof scheduleSchema>,
    "dayOfWeek" | "startTime" | "endTime" | "isAvailable"
  >,
  excludedScheduleId?: mongoose.Types.ObjectId,
) {
  if (!schedule.isAvailable) return false;
  const query: Record<string, unknown> = {
    doctorId,
    dayOfWeek: schedule.dayOfWeek,
    isAvailable: true,
  };
  if (excludedScheduleId) query._id = { $ne: excludedScheduleId };

  const otherSchedules = await DoctorSchedule.find(query);
  return otherSchedules.some((other) =>
    schedulesOverlap(schedule, other),
  );
}

async function hasAffectedActiveAppointments(
  doctorId: mongoose.Types.ObjectId,
  schedule: Pick<IDoctorScheduleLike, "dayOfWeek" | "startTime" | "endTime">,
): Promise<boolean> {
  const today = parseDateOnly(clinicDateKey());
  if (!today) throw new Error("Unable to determine the clinic date");

  const appointments = await Appointment.find({
    doctorId,
    appointmentDate: { $gte: today },
    status: { $in: ["scheduled", "confirmed"] },
  }).select("appointmentDate startTime endTime");

  return appointments.some((appointment) => {
    const appointmentDate = dateKey(appointment.appointmentDate);
    if (
      new Date(`${appointmentDate}T00:00:00.000Z`).getUTCDay() !==
      schedule.dayOfWeek
    ) {
      return false;
    }

    return (
      timeInMinutes(appointment.startTime) <
        timeInMinutes(schedule.endTime) &&
      timeInMinutes(appointment.endTime) >
        timeInMinutes(schedule.startTime)
    );
  });
}

type IDoctorScheduleLike = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export const createSchedule = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid schedule fields",
    });
    return;
  }

  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const doctor = await getDoctorForUser(req.user.id);
    if (!doctor) {
      res.status(404).json({
        success: false,
        message: "Doctor profile not found",
      });
      return;
    }

    if (await conflictsWithSchedule(doctor._id, parsed.data)) {
      res.status(409).json({
        success: false,
        message: "This schedule overlaps another available schedule",
      });
      return;
    }

    const schedule = await DoctorSchedule.create({
      ...parsed.data,
      doctorId: doctor._id,
    });
    res.status(201).json({
      success: true,
      message: "Doctor schedule created successfully",
      data: schedule,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      res.status(409).json({
        success: false,
        message: "This schedule already exists",
      });
      return;
    }
    console.error(
      "Create schedule error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to create doctor schedule",
    });
  }
};

export const getMySchedules = async (
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
    const doctor = await getDoctorForUser(req.user.id);
    if (!doctor) {
      res.status(404).json({
        success: false,
        message: "Doctor profile not found",
      });
      return;
    }

    const schedules = await DoctorSchedule.find({
      doctorId: doctor._id,
    }).sort({ dayOfWeek: 1, startTime: 1 });
    res.status(200).json({
      success: true,
      count: schedules.length,
      data: schedules,
    });
  } catch (error) {
    console.error(
      "Get schedules error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch schedules",
    });
  }
};

export const updateSchedule = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid schedule ID",
    });
    return;
  }
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid schedule fields",
    });
    return;
  }

  try {
    const doctor = req.user ? await getDoctorForUser(req.user.id) : null;
    if (!doctor) {
      res.status(req.user ? 404 : 401).json({
        success: false,
        message: req.user ? "Doctor profile not found" : "Authentication required",
      });
      return;
    }

    const schedule = await DoctorSchedule.findOne({
      _id: req.params.id,
      doctorId: doctor._id,
    });
    if (!schedule) {
      res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
      return;
    }

    if (await conflictsWithSchedule(doctor._id, parsed.data, schedule._id)) {
      res.status(409).json({
        success: false,
        message: "This schedule overlaps another available schedule",
      });
      return;
    }

    if (
      (schedule.isAvailable || parsed.data.isAvailable) &&
      (await hasAffectedActiveAppointments(doctor._id, schedule))
    ) {
      const replacements = await DoctorSchedule.find({
        doctorId: doctor._id,
        dayOfWeek: schedule.dayOfWeek,
        isAvailable: true,
        _id: { $ne: schedule._id },
      });
      const proposed =
        parsed.data.isAvailable && parsed.data.dayOfWeek === schedule.dayOfWeek
          ? [parsed.data]
          : [];
      const clinicToday = parseDateOnly(clinicDateKey());
      if (!clinicToday) throw new Error("Unable to determine the clinic date");
      const appointments = await Appointment.find({
        doctorId: doctor._id,
        appointmentDate: { $gte: clinicToday },
        status: { $in: ["scheduled", "confirmed"] },
      }).select("appointmentDate startTime endTime");
      const blocked = appointments.some((appointment) => {
        const sameDay =
          new Date(`${dateKey(appointment.appointmentDate)}T00:00:00.000Z`).getUTCDay() ===
          schedule.dayOfWeek;
        const affected =
          sameDay &&
          timeInMinutes(appointment.startTime) <
            timeInMinutes(schedule.endTime) &&
          timeInMinutes(appointment.endTime) >
            timeInMinutes(schedule.startTime);
        return (
          affected &&
          ![...replacements, ...proposed].some((replacement) =>
            scheduleContainsSlot(
              replacement,
              appointment.startTime,
              appointment.endTime,
            ),
          )
        );
      });
      if (blocked) {
        res.status(409).json({
          success: false,
          message: "Schedule changes cannot invalidate existing appointments",
        });
        return;
      }
    }

    schedule.set(parsed.data);
    await schedule.save();
    res.status(200).json({
      success: true,
      message: "Doctor schedule updated successfully",
      data: schedule,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      res.status(409).json({
        success: false,
        message: "This schedule already exists",
      });
      return;
    }
    console.error(
      "Update schedule error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to update doctor schedule",
    });
  }
};

export const deleteSchedule = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid schedule ID",
    });
    return;
  }

  try {
    const doctor = req.user ? await getDoctorForUser(req.user.id) : null;
    if (!doctor) {
      res.status(req.user ? 404 : 401).json({
        success: false,
        message: req.user ? "Doctor profile not found" : "Authentication required",
      });
      return;
    }

    const schedule = await DoctorSchedule.findOne({
      _id: req.params.id,
      doctorId: doctor._id,
    });
    if (!schedule) {
      res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
      return;
    }

    if (
      schedule.isAvailable &&
      (await hasAffectedActiveAppointments(doctor._id, schedule))
    ) {
      res.status(409).json({
        success: false,
        message: "This schedule has upcoming appointments and cannot be removed",
      });
      return;
    }

    await schedule.deleteOne();
    res.status(200).json({
      success: true,
      message: "Schedule deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete schedule error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to delete doctor schedule",
    });
  }
};

export const getDoctorSlots = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({
      success: false,
      message: "Invalid doctor ID",
    });
    return;
  }
  const date = parseDateOnly(req.query.date);
  if (!date) {
    res.status(400).json({
      success: false,
      message: "Provide a valid date in YYYY-MM-DD format",
    });
    return;
  }

  try {
    const doctor = await Doctor.findOne({
      _id: req.params.id,
      isAvailable: true,
    }).select("_id");
    if (!doctor) {
      res.status(404).json({
        success: false,
        message: "Doctor not found or unavailable",
      });
      return;
    }

    const dateString = dateKey(date);
    const schedules = await DoctorSchedule.find({
      doctorId: doctor._id,
      dayOfWeek: date.getUTCDay(),
      isAvailable: true,
    }).sort({ startTime: 1 });
    const appointments = await Appointment.find({
      doctorId: doctor._id,
      appointmentDate: date,
      status: { $in: ["scheduled", "confirmed"] },
    }).select("startTime status");
    const occupiedTimes = new Set(
      appointments.map((appointment) => appointment.startTime),
    );

    const slots = schedules.flatMap((schedule) => {
      const slots: { startTime: string; endTime: string; available: boolean }[] =
        [];
      const start = timeInMinutes(schedule.startTime);
      const end = timeInMinutes(schedule.endTime);
      for (
        let slotStart = start;
        slotStart + schedule.slotDuration <= end;
        slotStart += schedule.slotDuration
      ) {
        const startTime = formatTime(slotStart);
        slots.push({
          startTime,
          endTime: formatTime(slotStart + schedule.slotDuration),
          available:
            !isPastSlot(dateString, startTime) &&
            !occupiedTimes.has(startTime),
        });
      }
      return slots;
    });

    res.status(200).json({
      success: true,
      date: dateString,
      timeZone: process.env.CAREFLOW_TIME_ZONE || "Asia/Kolkata",
      slots,
    });
  } catch (error) {
    console.error(
      "Get doctor availability error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch available appointment slots",
    });
  }
};
