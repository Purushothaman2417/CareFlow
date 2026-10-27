import { emitQueueUpdate } from "../sockets/socket";
import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import QueueSession from "../models/QueueSession";
import QueueEntry from "../models/QueueEntry";
import { Appointment } from "../models/Appointment";
import { Doctor } from "../models/Doctor";
import { DoctorSchedule } from "../models/DoctorSchedule";
import { AuthRequest } from "../middleware/authMiddleware";
import { createNotification } from "../services/notificationService";
import { clinicDateKey, dateKey, parseDateOnly } from "../services/scheduling";

const getToday = () => parseDateOnly(clinicDateKey());
const skipQueueEntrySchema = z
  .object({
    entryId: z.string().optional(),
    skipReason: z.string().trim().max(500).optional(),
  })
  .strict();

async function addQueueWaitEstimates(
  entries: Awaited<ReturnType<typeof QueueEntry.find>>,
  queueSessionId: mongoose.Types.ObjectId,
  doctorId: mongoose.Types.ObjectId,
  date: Date,
) {
  const [activeEntries, schedule] = await Promise.all([
    QueueEntry.find({
      queueSessionId,
      status: { $in: ["waiting", "called", "in_consultation"] },
    })
      .select("queueNumber status")
      .sort({ queueNumber: 1 }),
    DoctorSchedule.findOne({
      doctorId,
      dayOfWeek: date.getUTCDay(),
      isAvailable: true,
    })
      .select("slotDuration")
      .sort({ startTime: 1 }),
  ]);
  const slotDuration = schedule?.slotDuration;

  return entries.map((entry) => {
    const peopleAhead = activeEntries.filter(
      (activeEntry) =>
        activeEntry.queueNumber < entry.queueNumber &&
        activeEntry.status !== "completed" &&
        activeEntry.status !== "cancelled",
    ).length;
    return {
      ...entry.toObject(),
      peopleAhead,
      estimatedWaitMinutes:
        slotDuration === undefined ? null : peopleAhead * slotDuration,
    };
  });
}

// Find today's queue or create one
const getOrCreateQueue = async (
  doctorId: mongoose.Types.ObjectId
) => {
  const today = getToday();
  if (!today) throw new Error("Unable to determine the clinic date");

  let queue = await QueueSession.findOne({
    doctorId,
    date: today,
  });

  if (!queue) {
    try {
      queue = await QueueSession.create({
        doctorId,
        date: today,
        status: "open",
        currentNumber: 0,
        totalPatients: 0,
        nextQueueNumber: 0,
      });
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 11000
      ) {
        throw error;
      }

      queue = await QueueSession.findOne({
        doctorId,
        date: today,
      });
      if (!queue) throw error;
    }
  }

  return queue;
};

// =====================================================
// PATIENT CHECK-IN
// POST /api/queue/check-in
// =====================================================

export const checkInPatient = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const isStaff =
      req.user?.role === "receptionist" || req.user?.role === "admin";
    if (req.user?.role !== "patient" && !isStaff) {
      return res.status(403).json({
        success: false,
        message: "Only patients and authorized clinic staff can check in",
      });
    }

    const { appointmentId } = req.body;

    // Validate appointment ID
    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "Appointment ID is required",
      });
    }

    // Find appointment
    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // If patient, make sure appointment belongs to logged-in patient
    if (req.user?.role === "patient" && appointment.patientId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only check in for your own appointment",
      });
    }

    // Cancelled appointment cannot enter queue
    if (appointment.status !== "confirmed") {
      return res.status(400).json({
        success: false,
        message: "Only confirmed appointments can enter the queue",
      });
    }

    const today = clinicDateKey();
    if (dateKey(appointment.appointmentDate) !== today) {
      return res.status(400).json({
        success: false,
        message: "Patients can only check in on the appointment date",
      });
    }

    // Get or create today's queue
    const queue = await getOrCreateQueue(
      appointment.doctorId
    );

    // Check whether queue is closed
    if (queue.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "Today's queue is closed",
      });
    }

    // Prevent duplicate check-in
    const existingEntry = await QueueEntry.findOne({
      appointmentId: appointment._id,
    });

    if (existingEntry) {
      return res.status(400).json({
        success: false,
        message: "Patient is already in the queue",
        entry: existingEntry,
      });
    }

    const updatedQueue = await QueueSession.findOneAndUpdate(
      { _id: queue._id, status: "open" },
      [
        {
          $set: {
            nextQueueNumber: {
              $add: [
                { $ifNull: ["$nextQueueNumber", "$totalPatients"] },
                1,
              ],
            },
          },
        },
      ],
      { new: true },
    );
    if (!updatedQueue) {
      return res.status(409).json({
        success: false,
        message: "Today's queue is closed",
      });
    }
    const queueNumber = updatedQueue.nextQueueNumber;

    // Create queue entry
    let entry;
    try {
      entry = await QueueEntry.create({
        queueSessionId: queue._id,
        appointmentId: appointment._id,
        patientId: appointment.patientId,
        queueNumber,
        status: "waiting",
        checkedInAt: new Date(),
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        const existingEntry = await QueueEntry.findOne({
          appointmentId: appointment._id,
        });
        return res.status(409).json({
          success: false,
          message: "Patient is already in the queue",
          ...(existingEntry ? { entry: existingEntry } : {}),
        });
      }
      throw error;
    }

    await QueueSession.updateOne(
      { _id: queue._id },
      { $inc: { totalPatients: 1 } },
    );
    emitQueueUpdate("PATIENT_CHECKED_IN", entry);

    return res.status(201).json({
      success: true,
      message: "Patient checked in successfully",
      entry,
    });
  } catch (error) {
    console.error("Check-in error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check in patient",
    });
  }
};

export const getMyQueueEntries = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (req.user?.role !== "patient") {
      return res.status(403).json({
        success: false,
        message: "Only patients can view their queue status",
      });
    }

    const today = getToday();
    if (!today) {
      return res.status(500).json({
        success: false,
        message: "Unable to determine the clinic date",
      });
    }

    const sessions = await QueueSession.find({ date: today }).select("_id");
    const entries = await QueueEntry.find({
      queueSessionId: { $in: sessions.map((session) => session._id) },
      patientId: req.user.id,
    })
      .populate("queueSessionId", "doctorId date status currentNumber totalPatients")
      .populate("appointmentId", "appointmentDate startTime endTime status")
      .sort({ createdAt: -1 });

    const enrichedEntries = await Promise.all(
      entries.map(async (entry) => {
        const session = entry.queueSessionId as unknown as {
          _id: mongoose.Types.ObjectId;
          doctorId: mongoose.Types.ObjectId;
          date: Date;
        };
        const estimates = await addQueueWaitEstimates(
          [entry],
          session._id,
          session.doctorId,
          session.date,
        );
        return estimates[0];
      }),
    );

    return res.json({ success: true, data: enrichedEntries });
  } catch (error) {
    console.error("Get patient queue status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get queue status",
    });
  }
};

// =====================================================
// GET TODAY'S QUEUE
// GET /api/queue/today
// =====================================================

export const getTodayQueue = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    let doctorId: mongoose.Types.ObjectId;

    if (req.user?.role === "doctor") {
      const doctor = await Doctor.findOne({
        userId: req.user.id,
      });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: "Doctor profile not found",
        });
      }
      doctorId = doctor._id;
    } else if (
      (req.user?.role === "receptionist" || req.user?.role === "admin") &&
      req.query.doctorId &&
      typeof req.query.doctorId === "string" &&
      mongoose.isValidObjectId(req.query.doctorId)
    ) {
      doctorId = new mongoose.Types.ObjectId(req.query.doctorId);
    } else {
      return res.status(403).json({
        success: false,
        message: "Doctor ID is required for clinic staff queue queries",
      });
    }

    // Find today's queue
    const queue = await QueueSession.findOne({
      doctorId,
      date: getToday(),
    });

    // No queue yet
    if (!queue) {
      return res.json({
        success: true,
        message: "No queue created for today",
        queue: null,
        entries: [],
      });
    }

    // Get queue entries
    const queueDate = getToday();
    const entries = await QueueEntry.find({
      queueSessionId: queue._id,
    })
      .populate("patientId", "name email phone")
      .populate("appointmentId")
      .sort({ queueNumber: 1 });
    const estimatedEntries = queueDate
      ? await addQueueWaitEstimates(entries, queue._id, doctorId, queueDate)
      : entries;

    return res.json({
      success: true,
      queue,
      entries: estimatedEntries,
    });
  } catch (error) {
    console.error("Get queue error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get today's queue",
    });
  }
};

// =====================================================
// CALL NEXT PATIENT
// POST /api/queue/call-next
// =====================================================

export const callNextPatient = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    // Only doctors can call patients
    if (req.user?.role !== "doctor") {
      return res.status(403).json({
        success: false,
        message: "Only doctors can call patients",
      });
    }

    // Find doctor's profile
    const doctor = await Doctor.findOne({
      userId: req.user.id,
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor profile not found",
      });
    }

    // Find today's active queue
    const queue = await QueueSession.findOne({
      doctorId: doctor._id,
      date: getToday(),
      status: "open",
    });

    if (!queue) {
      return res.status(404).json({
        success: false,
        message: "No active queue found",
      });
    }

    // Check whether another patient is already called or in consultation
    const inProgressPatient = await QueueEntry.findOne({
      queueSessionId: queue._id,
      status: { $in: ["called", "in_consultation"] },
    });

    if (inProgressPatient) {
      return res.status(400).json({
        success: false,
        message:
          inProgressPatient.status === "in_consultation"
            ? "A patient is currently in consultation. Complete the visit first."
            : "A patient is already being called.",
        entry: inProgressPatient,
      });
    }

    let nextPatient = null;
    while (!nextPatient) {
      const nextWaiting = await QueueEntry.findOne({
        queueSessionId: queue._id,
        status: "waiting",
      }).sort({ queueNumber: 1 });

      if (!nextWaiting) {
        return res.status(404).json({
          success: false,
          message: "No patients are waiting",
        });
      }

      const appointment = await Appointment.findOne({
        _id: nextWaiting.appointmentId,
        status: "confirmed",
      }).select("_id");
      if (!appointment) {
        const cancelledEntry = await QueueEntry.findOneAndUpdate(
          { _id: nextWaiting._id, status: "waiting" },
          { $set: { status: "cancelled" } },
          { new: true },
        );
        if (cancelledEntry) emitQueueUpdate("PATIENT_CANCELLED", cancelledEntry);
        continue;
      }

      nextPatient = await QueueEntry.findOneAndUpdate(
        { _id: nextWaiting._id, status: "waiting" },
        { $set: { status: "called", calledAt: new Date() } },
        { new: true },
      );
    }

    // Update current queue number
    queue.currentNumber = nextPatient.queueNumber;

    await queue.save();
    await createNotification({
  userId: nextPatient.patientId.toString(),
  title: "Your Turn",
  message: `You are now being called for your consultation. Queue number: ${nextPatient.queueNumber}.`,
  type: "queue",
});
    emitQueueUpdate("PATIENT_CALLED", nextPatient);

    return res.json({
      success: true,
      message: "Next patient called",
      entry: nextPatient,
    });
  } catch (error) {
    console.error("Call next patient error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to call next patient",
    });
  }
};

// =====================================================
// START CONSULTATION VISIT
// POST /api/queue/start-visit
// =====================================================
export const startConsultationVisit = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (req.user?.role !== "doctor") {
      return res.status(403).json({
        success: false,
        message: "Only doctors can start a consultation visit",
      });
    }

    const doctor = await Doctor.findOne({ userId: req.user.id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor profile not found",
      });
    }

    const queue = await QueueSession.findOne({
      doctorId: doctor._id,
      date: getToday(),
      status: "open",
    });

    if (!queue) {
      return res.status(404).json({
        success: false,
        message: "No active queue session found for today",
      });
    }

    const calledEntry = await QueueEntry.findOneAndUpdate(
      {
        queueSessionId: queue._id,
        status: "called",
      },
      {
        $set: { status: "in_consultation" },
      },
      { new: true },
    );

    if (!calledEntry) {
      return res.status(400).json({
        success: false,
        message: "No patient is currently called to begin consultation",
      });
    }

    emitQueueUpdate("PATIENT_IN_CONSULTATION", calledEntry);

    return res.json({
      success: true,
      message: "Consultation visit started",
      entry: calledEntry,
    });
  } catch (error) {
    console.error("Start consultation visit error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to start consultation visit",
    });
  }
};

// =====================================================
// SKIP PATIENT
// POST /api/queue/skip
// =====================================================
export const skipPatient = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const isStaff =
      req.user?.role === "doctor" ||
      req.user?.role === "receptionist" ||
      req.user?.role === "admin";
    if (!isStaff) {
      return res.status(403).json({
        success: false,
        message: "Only clinical and clinic staff can skip a queue entry",
      });
    }

    const parsed = skipQueueEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid queue entry ID and skip reason",
      });
    }

    const { entryId, skipReason } = parsed.data;
    let query: Record<string, unknown> = { status: "called" };
    if (entryId && mongoose.isValidObjectId(entryId)) {
      query._id = new mongoose.Types.ObjectId(entryId);
    } else if (req.user?.role === "doctor") {
      const doctor = await Doctor.findOne({ userId: req.user.id });
      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: "Doctor profile not found",
        });
      }
      const queue = await QueueSession.findOne({
        doctorId: doctor._id,
        date: getToday(),
      });
      if (!queue) {
        return res.status(404).json({
          success: false,
          message: "No active queue found",
        });
      }
      query.queueSessionId = queue._id;
    } else {
      return res.status(400).json({
        success: false,
        message: "Entry ID is required",
      });
    }

    const skippedEntry = await QueueEntry.findOneAndUpdate(
      query,
      {
        $set: {
          status: "skipped",
          ...(skipReason ? { skipReason } : {}),
        },
      },
      { new: true },
    );

    if (!skippedEntry) {
      return res.status(404).json({
        success: false,
        message: "No called patient found to skip",
      });
    }

    emitQueueUpdate("PATIENT_SKIPPED", skippedEntry);

    return res.json({
      success: true,
      message: "Patient marked as skipped",
      entry: skippedEntry,
    });
  } catch (error) {
    console.error("Skip patient error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to skip patient",
    });
  }
};

// =====================================================
// REQUEUE PATIENT
// POST /api/queue/requeue
// =====================================================
export const requeuePatient = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const isStaff =
      req.user?.role === "doctor" ||
      req.user?.role === "receptionist" ||
      req.user?.role === "admin";
    if (!isStaff) {
      return res.status(403).json({
        success: false,
        message: "Only staff can re-queue a patient",
      });
    }

    const { entryId } = req.body;
    if (!entryId || !mongoose.isValidObjectId(entryId)) {
      return res.status(400).json({
        success: false,
        message: "Valid entry ID is required",
      });
    }

    const entry = await QueueEntry.findOneAndUpdate(
      { _id: entryId, status: "skipped" },
      { $set: { status: "waiting" } },
      { new: true },
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Skipped queue entry not found",
      });
    }

    emitQueueUpdate("PATIENT_REQUEUED", entry);

    return res.json({
      success: true,
      message: "Patient returned to waiting queue",
      entry,
    });
  } catch (error) {
    console.error("Requeue patient error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to requeue patient",
    });
  }
};

// =====================================================
// GET HOSPITAL QUEUES OVERVIEW (Receptionist / Admin)
// GET /api/queue/hospital
// =====================================================
export const getHospitalQueues = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (req.user?.role !== "receptionist" && req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only receptionist and admin staff can view hospital queue oversight",
      });
    }

    const today = getToday();
    if (!today) {
      return res.status(500).json({
        success: false,
        message: "Unable to determine clinic date",
      });
    }

    const sessions = await QueueSession.find({ date: today })
      .populate({
        path: "doctorId",
        select: "specialization department isAvailable",
        populate: { path: "userId", select: "name email phone" },
      })
      .sort({ createdAt: 1 });

    const queuesWithDetails = await Promise.all(
      sessions.map(async (session) => {
        const entries = await QueueEntry.find({
          queueSessionId: session._id,
        })
          .populate("patientId", "name email phone")
          .populate("appointmentId", "startTime endTime reason status")
          .sort({ queueNumber: 1 });

        const waitingCount = entries.filter((e) => e.status === "waiting").length;
        const calledEntry = entries.find((e) => e.status === "called") || null;
        const inConsultationEntry =
          entries.find((e) => e.status === "in_consultation") || null;
        const completedCount = entries.filter((e) => e.status === "completed").length;
        const skippedCount = entries.filter((e) => e.status === "skipped").length;

        return {
          session,
          metrics: {
            totalCheckedIn: entries.length,
            waitingCount,
            completedCount,
            skippedCount,
          },
          calledEntry,
          inConsultationEntry,
          entries,
        };
      }),
    );

    return res.json({
      success: true,
      data: queuesWithDetails,
    });
  } catch (error) {
    console.error("Get hospital queues error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hospital queue data",
    });
  }
};
