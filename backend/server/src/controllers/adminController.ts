import { Response } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";

import { User } from "../models/User";
import { Doctor } from "../models/Doctor";
import { Appointment } from "../models/Appointment";
import QueueEntry from "../models/QueueEntry";
import QueueSession from "../models/QueueSession";
import { AuthRequest } from "../middleware/authMiddleware";
import { disconnectUserSockets } from "../sockets/socket";
import { parseDateOnly } from "../services/scheduling";

const createStaffSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    password: z.string().min(6).max(128),
    role: z.enum(["doctor", "receptionist", "patient"]),
    phone: z.string().trim().max(32).optional(),
    // Doctor specific fields
    specialization: z.string().trim().min(2).max(100).optional(),
    department: z.string().trim().min(2).max(100).optional(),
    qualification: z.string().trim().min(2).max(200).optional(),
    experienceYears: z.number().int().min(0).max(80).optional(),
    licenseNumber: z.string().trim().min(1).max(100).optional(),
    consultationFee: z.number().min(0).max(1_000_000).optional(),
    bio: z.string().trim().max(1000).optional(),
  })
  .strict();

export const getStaffList = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (req.user?.role !== "admin" && req.user?.role !== "receptionist") {
      res.status(403).json({
        success: false,
        message: "Only administrative and receptionist staff can view the staff directory",
      });
      return;
    }

    const { role, search } = req.query;
    const filter: Record<string, unknown> = {};

    if (role && typeof role === "string" && ["doctor", "receptionist", "admin", "patient"].includes(role)) {
      filter.role = role;
    } else if (req.user?.role === "receptionist") {
      // Receptionist can view doctors and patients
      filter.role = { $in: ["doctor", "patient"] };
    }

    if (search && typeof search === "string" && search.trim().length > 0) {
      const exp = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: exp }, { email: exp }, { phone: exp }];
    }

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    const doctorUserIds = users.filter((u) => u.role === "doctor").map((u) => u._id);
    const doctorProfiles = await Doctor.find({ userId: { $in: doctorUserIds } }).lean();
    const doctorMap = new Map(doctorProfiles.map((d) => [d.userId.toString(), d]));

    const staffWithProfiles = users.map((u) => ({
      ...u,
      doctorProfile: u.role === "doctor" ? doctorMap.get(u._id.toString()) || null : null,
    }));

    res.status(200).json({
      success: true,
      count: staffWithProfiles.length,
      data: staffWithProfiles,
    });
  } catch (error) {
    console.error("Get staff list error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch staff directory",
    });
  }
};

export const updateStaffStatus = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "Only administrators can change account activation status",
      });
      return;
    }

    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.isValidObjectId(id) || typeof isActive !== "boolean") {
      res.status(400).json({
        success: false,
        message: "Invalid account ID or isActive status",
      });
      return;
    }

    if (id === req.user.id && !isActive) {
      res.status(400).json({
        success: false,
        message: "You cannot deactivate your own administrative account",
      });
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User account not found",
      });
      return;
    }

    user.isActive = isActive;
    if (!isActive) {
      user.authVersion += 1;
      disconnectUserSockets(user._id.toString());
    }
    await user.save();

    res.status(200).json({
      success: true,
      message: `Account has been ${isActive ? "activated" : "deactivated"}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error("Update staff status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update account status",
    });
  }
};

export const createStaffMember = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "Only administrators can create staff accounts",
      });
      return;
    }

    const parsed = createStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || "Invalid account input",
      });
      return;
    }

    const {
      name,
      email,
      password,
      role,
      phone,
      specialization,
      department,
      qualification,
      experienceYears,
      licenseNumber,
      consultationFee,
      bio,
    } = parsed.data;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "An account with this email address already exists",
      });
      return;
    }

    if (role === "doctor") {
      if (!specialization || !qualification || !licenseNumber || consultationFee === undefined) {
        res.status(400).json({
          success: false,
          message: "Doctor accounts require specialization, qualification, license number, and consultation fee",
        });
        return;
      }

      const existingLicense = await Doctor.findOne({ licenseNumber });
      if (existingLicense) {
        res.status(409).json({
          success: false,
          message: "A doctor profile with this license number already exists",
        });
        return;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      phone,
      isActive: true,
      authVersion: 0,
    });

    let doctorProfile = null;
    if (role === "doctor") {
      doctorProfile = await Doctor.create({
        userId: user._id,
        specialization,
        department: department || "General Medicine",
        qualification,
        experienceYears: experienceYears || 0,
        licenseNumber,
        consultationFee,
        bio,
        isAvailable: true,
      });
    }

    res.status(201).json({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      doctorProfile,
    });
  } catch (error) {
    console.error("Create staff member error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create staff account",
    });
  }
};

export const getOperationalReports = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "Only administrators can access hospital operational intelligence",
      });
      return;
    }

    const { startDate, endDate } = req.query;
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const parsedStart = typeof startDate === "string" ? parseDateOnly(startDate) || defaultStart : defaultStart;
    const parsedEnd = typeof endDate === "string" ? parseDateOnly(endDate) || now : now;

    const dateFilter = {
      appointmentDate: { $gte: parsedStart, $lte: parsedEnd },
    };

    const [
      totalAppointments,
      statusCounts,
      doctorPerformance,
      departmentBreakdown,
      queueStats,
      userMetrics,
    ] = await Promise.all([
      Appointment.countDocuments(dateFilter),
      Appointment.aggregate([
        { $match: dateFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Appointment.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: "$doctorId",
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          },
        },
        {
          $lookup: {
            from: "doctors",
            localField: "_id",
            foreignField: "_id",
            as: "doctor",
          },
        },
        { $unwind: "$doctor" },
        {
          $lookup: {
            from: "users",
            localField: "doctor.userId",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            doctorId: "$_id",
            name: "$user.name",
            specialization: "$doctor.specialization",
            department: { $ifNull: ["$doctor.department", "General Medicine"] },
            total: 1,
            completed: 1,
            cancelled: 1,
          },
        },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      Appointment.aggregate([
        { $match: dateFilter },
        {
          $lookup: {
            from: "doctors",
            localField: "doctorId",
            foreignField: "_id",
            as: "doctor",
          },
        },
        { $unwind: { path: "$doctor", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ["$doctor.department", "General Medicine"] },
            count: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          },
        },
        { $sort: { count: -1 } },
      ]),
      QueueEntry.aggregate([
        {
          $match: {
            createdAt: { $gte: parsedStart, $lte: parsedEnd },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
      Promise.all([
        User.countDocuments({ role: "patient", isActive: true }),
        User.countDocuments({ role: "doctor", isActive: true }),
        User.countDocuments({ role: "receptionist", isActive: true }),
      ]),
    ]);

    const statusMap = new Map(statusCounts.map((s) => [s._id, s.count]));
    const completedCount = statusMap.get("completed") || 0;
    const cancelledCount = statusMap.get("cancelled") || 0;
    const scheduledCount = statusMap.get("scheduled") || 0;
    const confirmedCount = statusMap.get("confirmed") || 0;
    const rejectedCount = statusMap.get("rejected") || 0;

    const completionRate = totalAppointments > 0 ? Math.round((completedCount / totalAppointments) * 100) : 0;
    const cancellationRate = totalAppointments > 0 ? Math.round((cancelledCount / totalAppointments) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        dateRange: {
          start: parsedStart.toISOString().slice(0, 10),
          end: parsedEnd.toISOString().slice(0, 10),
        },
        summary: {
          totalAppointments,
          completedCount,
          cancelledCount,
          scheduledCount,
          confirmedCount,
          rejectedCount,
          completionRate,
          cancellationRate,
          registeredPatients: userMetrics[0],
          registeredDoctors: userMetrics[1],
          registeredReceptionists: userMetrics[2],
        },
        doctorPerformance,
        departmentBreakdown,
        queueBreakdown: queueStats.map((q) => ({ status: q._id, count: q.count })),
      },
    });
  } catch (error) {
    console.error("Get operational reports error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate operational reports",
    });
  }
};

export const getAuditLogs = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    if (req.user?.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "Only administrators can view audit logs",
      });
      return;
    }

    const appointmentsWithAudit = await Appointment.find({
      "auditTrail.0": { $exists: true },
    })
      .select("appointmentDate startTime status auditTrail patientId doctorId")
      .populate("patientId", "name")
      .populate({
        path: "doctorId",
        populate: { path: "userId", select: "name" },
      })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    const flattenedLogs = appointmentsWithAudit.flatMap((app) =>
      (app.auditTrail || []).map((trail) => ({
        id: `${app._id}-${trail.timestamp?.toISOString()}`,
        appointmentId: app._id,
        action: trail.action,
        role: trail.role || "system",
        timestamp: trail.timestamp,
        note: trail.note,
        patientName: typeof app.patientId === "object" && app.patientId ? (app.patientId as any).name : "Patient",
        doctorName:
          typeof app.doctorId === "object" && app.doctorId && typeof (app.doctorId as any).userId === "object"
            ? (app.doctorId as any).userId.name
            : "Doctor",
      }))
    );

    flattenedLogs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.status(200).json({
      success: true,
      count: flattenedLogs.length,
      data: flattenedLogs.slice(0, 100),
    });
  } catch (error) {
    console.error("Get audit logs error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch audit logs",
    });
  }
};
