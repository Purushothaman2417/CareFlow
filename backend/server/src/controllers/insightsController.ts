import { Response } from "express";

import { Appointment } from "../models/Appointment";
import { Doctor } from "../models/Doctor";
import { User } from "../models/User";
import { AuthRequest } from "../middleware/authMiddleware";

export const getInsights = async (
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
  if (!["patient", "doctor", "admin"].includes(req.user.role)) {
    res.status(403).json({
      success: false,
      message: "Access denied",
    });
    return;
  }

  try {
    let match: Record<string, unknown>;
    if (req.user.role === "patient") {
      match = { patientId: req.user.id };
    } else if (req.user.role === "doctor") {
      const doctor = await Doctor.findOne({ userId: req.user.id }).select("_id");
      if (!doctor) {
        res.status(404).json({
          success: false,
          message: "Doctor profile not found",
        });
        return;
      }
      match = { doctorId: doctor._id };
    } else {
      match = {};
    }

    const now = new Date();
    const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const afterLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const dateMatch = {
      ...match,
      appointmentDate: { $gte: firstMonth, $lt: afterLastMonth },
    };

    const [total, completed, scheduled, byStatus, monthly, bySpecialty, recent, registeredCounts] =
      await Promise.all([
        Appointment.countDocuments(match),
        Appointment.countDocuments({ ...match, status: "completed" }),
        Appointment.countDocuments({ ...match, status: "scheduled" }),
        Appointment.aggregate<{ _id: string; count: number }>([
          { $match: match },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Appointment.aggregate<{ _id: string; count: number }>([
          { $match: dateMatch },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: "$appointmentDate",
                  timezone: "UTC",
                },
              },
              count: { $sum: 1 },
            },
          },
        ]),
        Appointment.aggregate<{ _id: string; count: number }>([
          { $match: match },
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
              _id: { $ifNull: ["$doctor.specialization", "Other"] },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1, _id: 1 } },
        ]),
        Appointment.find(match)
          .populate("patientId", "name")
          .populate({
            path: "doctorId",
            select: "specialization",
            populate: { path: "userId", select: "name" },
          })
          .sort({ appointmentDate: -1, startTime: -1 })
          .limit(20)
          .lean(),
        req.user.role === "admin"
          ? Promise.all([
              User.countDocuments({ role: "doctor", isActive: true }),
              User.countDocuments({ role: "patient", isActive: true }),
            ])
          : Promise.resolve(null),
      ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        completed,
        scheduled,
        byStatus: byStatus.map(({ _id, count }) => ({ name: _id, value: count })),
        monthly: monthly.map(({ _id, count }) => ({ month: _id, count })),
        bySpecialty: bySpecialty.map(({ _id, count }) => ({ name: _id, count })),
        recentAppointments: recent,
        ...(registeredCounts
          ? {
              registeredDoctors: registeredCounts[0],
              registeredPatients: registeredCounts[1],
            }
          : {}),
      },
    });
  } catch (error) {
    console.error(
      "Get insights error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch insights",
    });
  }
};
