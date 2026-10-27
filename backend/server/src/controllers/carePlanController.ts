import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { Appointment } from "../models/Appointment";
import { CarePlan } from "../models/CarePlan";
import { Doctor } from "../models/Doctor";
import { AuthRequest } from "../middleware/authMiddleware";
import { createNotification } from "../services/notificationService";
import { clinicDateKey, parseDateOnly } from "../services/scheduling";

const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

const medicationSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    dosage: z.string().trim().min(1).max(100),
    schedule: z.string().trim().min(1).max(200),
    instructions: z.string().trim().max(1000).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

const createCarePlanSchema = z
  .object({
    patientId: z.string().refine(mongoose.isValidObjectId),
    title: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).optional(),
    tasks: z.array(taskSchema).max(20).default([]),
    medications: z.array(medicationSchema).max(20).default([]),
  })
  .strict()
  .refine(
    (input) => input.tasks.length > 0 || input.medications.length > 0,
    "A care plan needs at least one task or medication",
  );

const taskStatusSchema = z
  .object({ status: z.enum(["pending", "completed"]) })
  .strict();

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  return parseDateOnly(value) ?? undefined;
}

export const getCarePlans = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }

  try {
    if (req.user.role === "patient") {
      const plans = await CarePlan.find({ patientId: req.user.id })
        .populate("patientId", "name")
        .populate({
          path: "doctorId",
          select: "userId specialization",
          populate: { path: "userId", select: "name" },
        })
        .sort({ createdAt: -1 });
      res.status(200).json({ success: true, data: plans });
      return;
    }

    if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
      if (!doctor) {
        res.status(404).json({ success: false, message: "Doctor profile not found" });
        return;
      }
      const plans = await CarePlan.find({ doctorId: doctor._id })
        .populate("patientId", "name")
        .populate({
          path: "doctorId",
          select: "userId specialization",
          populate: { path: "userId", select: "name" },
        })
        .sort({ createdAt: -1 });
      res.status(200).json({ success: true, data: plans });
      return;
    }

    res.status(403).json({ success: false, message: "Access denied" });
  } catch (error) {
    console.error(
      "Get care plans error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({ success: false, message: "Failed to load care plans" });
  }
};

export const createCarePlan = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (req.user?.role !== "doctor") {
    res.status(403).json({ success: false, message: "Only doctors can create care plans" });
    return;
  }

  const parsed = createCarePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Provide a valid care plan" });
    return;
  }

  const invalidTaskDate = parsed.data.tasks.some(
    (task) => task.dueDate && !parseDate(task.dueDate),
  );
  const invalidMedicationDate = parsed.data.medications.some((medication) => {
    const startDate = parseDate(medication.startDate);
    const endDate = parseDate(medication.endDate);
    return (
      !startDate ||
      (medication.endDate && !endDate) ||
      (!!endDate && !!startDate && endDate < startDate)
    );
  });
  if (invalidTaskDate || invalidMedicationDate) {
    res.status(400).json({ success: false, message: "Provide valid care plan dates" });
    return;
  }

  const tasks = parsed.data.tasks.map((task) => ({
    title: task.title,
    dueDate: parseDate(task.dueDate),
    status: "pending" as const,
  }));
  const medications = [];
  for (const medication of parsed.data.medications) {
    const startDate = parseDate(medication.startDate);
    const endDate = parseDate(medication.endDate);
    if (!startDate) {
      res.status(400).json({ success: false, message: "Provide valid care plan dates" });
      return;
    }
    medications.push({
      ...medication,
      startDate,
      endDate,
      takenDates: [],
    });
  }

  try {
    const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
    if (!doctor) {
      res.status(404).json({ success: false, message: "Doctor profile not found" });
      return;
    }
    const hasRelationship = await Appointment.exists({
      doctorId: doctor._id,
      patientId: parsed.data.patientId,
      status: { $in: ["scheduled", "confirmed", "completed"] },
    });
    if (!hasRelationship) {
      res.status(403).json({
        success: false,
        message: "Care plans can only be created for your patients",
      });
      return;
    }

    const plan = await CarePlan.create({
      patientId: parsed.data.patientId,
      doctorId: doctor._id,
      title: parsed.data.title,
      notes: parsed.data.notes,
      tasks,
      medications,
    });
    await createNotification({
      userId: parsed.data.patientId,
      title: "Care plan updated",
      message: `Your doctor added a care plan: ${plan.title}.`,
      type: "consultation",
    });
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    console.error(
      "Create care plan error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({ success: false, message: "Failed to save care plan" });
  }
};

export const updateCarePlanTask = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (req.user?.role !== "patient") {
    res.status(403).json({ success: false, message: "Only patients can update care tasks" });
    return;
  }
  if (
    !mongoose.isValidObjectId(req.params.id) ||
    !mongoose.isValidObjectId(req.params.taskId)
  ) {
    res.status(400).json({ success: false, message: "Invalid care plan task" });
    return;
  }
  const parsed = taskStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Provide a valid task status" });
    return;
  }

  try {
    const plan = await CarePlan.findOne({
      _id: req.params.id,
      patientId: req.user.id,
      "tasks._id": req.params.taskId,
    });
    if (!plan) {
      res.status(404).json({ success: false, message: "Care task not found" });
      return;
    }
    const task = plan.tasks.find(
      (entry) => entry._id.toString() === req.params.taskId,
    );
    if (!task) {
      res.status(404).json({ success: false, message: "Care task not found" });
      return;
    }
    task.status = parsed.data.status;
    task.completedAt =
      parsed.data.status === "completed" ? new Date() : undefined;
    await plan.save();
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    console.error(
      "Update care task error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({ success: false, message: "Failed to update care task" });
  }
};

export const toggleMedicationTaken = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  if (req.user?.role !== "patient") {
    res.status(403).json({ success: false, message: "Only patients can update medication tracking" });
    return;
  }
  if (
    !mongoose.isValidObjectId(req.params.id) ||
    !mongoose.isValidObjectId(req.params.medicationId)
  ) {
    res.status(400).json({ success: false, message: "Invalid medication entry" });
    return;
  }

  try {
    const plan = await CarePlan.findOne({
      _id: req.params.id,
      patientId: req.user.id,
      "medications._id": req.params.medicationId,
    });
    if (!plan) {
      res.status(404).json({ success: false, message: "Medication entry not found" });
      return;
    }
    const medication = plan.medications.find(
      (entry) => entry._id.toString() === req.params.medicationId,
    );
    if (!medication) {
      res.status(404).json({ success: false, message: "Medication entry not found" });
      return;
    }
    const today = clinicDateKey();
    const todayDate = parseDateOnly(today);
    if (
      !todayDate ||
      medication.startDate > todayDate ||
      (medication.endDate && medication.endDate < todayDate)
    ) {
      res.status(400).json({
        success: false,
        message: "Medication tracking is only available within its prescribed date range",
      });
      return;
    }
    medication.takenDates = medication.takenDates.includes(today)
      ? medication.takenDates.filter((date) => date !== today)
      : [...medication.takenDates, today];
    await plan.save();
    res.status(200).json({ success: true, data: plan });
  } catch (error) {
    console.error(
      "Update medication tracking error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({ success: false, message: "Failed to update medication tracking" });
  }
};
