import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { Doctor } from "../models/Doctor";
import { User } from "../models/User";
import { AuthRequest } from "../middleware/authMiddleware";

const createDoctorSchema = z
  .object({
    specialization: z.string().trim().min(2).max(100),
    department: z.string().trim().min(2).max(100).optional(),
    qualification: z.string().trim().min(2).max(200),
    experienceYears: z.number().int().min(0).max(80),
    licenseNumber: z.string().trim().min(1).max(100),
    consultationFee: z.number().min(0).max(1_000_000),
    bio: z.string().trim().max(1000).optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict();

const updateDoctorSchema = createDoctorSchema
  .omit({ licenseNumber: true })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isDuplicateKeyError = (
  error: unknown,
): error is { code: number } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

// Create doctor profile
export const createDoctor = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const parsed = createDoctorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid doctor profile fields",
      });
      return;
    }
    const {
      specialization,
      department,
      qualification,
      experienceYears,
      licenseNumber,
      consultationFee,
      bio,
      isAvailable,
    } = parsed.data;

    const user = await User.findById(req.user.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    if (user.role !== "doctor") {
      res.status(403).json({
        success: false,
        message: "Only doctor accounts can create doctor profiles",
      });
      return;
    }

    const existingProfile = await Doctor.findOne({
      userId: user._id,
    });

    if (existingProfile) {
      res.status(409).json({
        success: false,
        message: "Doctor profile already exists",
      });
      return;
    }

    const existingLicense = await Doctor.findOne({
      licenseNumber,
    });

    if (existingLicense) {
      res.status(409).json({
        success: false,
        message: "License number already exists",
      });
      return;
    }

    const doctor = await Doctor.create({
      userId: user._id,
      specialization,
      department: department || "General Medicine",
      qualification,
      experienceYears,
      licenseNumber,
      consultationFee,
      bio,
      isAvailable,
    });

    res.status(201).json({
      success: true,
      message: "Doctor profile created successfully",
      doctor,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      res.status(409).json({
        success: false,
        message: "A doctor profile or license with these details already exists",
      });
      return;
    }

    console.error(
      "Create doctor error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    res.status(500).json({
      success: false,
      message: "Failed to create doctor profile",
    });
  }
};

// Get all doctors
export const getDoctors = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (
      (req.query.search !== undefined &&
        typeof req.query.search !== "string") ||
      (req.query.specialization !== undefined &&
        typeof req.query.specialization !== "string") ||
      (req.query.department !== undefined &&
        typeof req.query.department !== "string") ||
      (req.query.sort !== undefined && typeof req.query.sort !== "string")
    ) {
      res.status(400).json({
        success: false,
        message: "Search, specialty, department, and sort filters must be single values",
      });
      return;
    }

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const specialization =
      typeof req.query.specialization === "string"
        ? req.query.specialization.trim()
        : "";
    const department =
      typeof req.query.department === "string"
        ? req.query.department.trim()
        : "";
    const availability = req.query.availability;
    const sort =
      typeof req.query.sort === "string" ? req.query.sort : "newest";

    if (
      search.length > 100 ||
      specialization.length > 100 ||
      department.length > 100
    ) {
      res.status(400).json({
        success: false,
        message: "Search and filter inputs must be 100 characters or fewer",
      });
      return;
    }

    if (
      availability !== undefined &&
      availability !== "true" &&
      availability !== "false"
    ) {
      res.status(400).json({
        success: false,
        message: "Availability filter must be true or false",
      });
      return;
    }

    if (!["newest", "name", "experience", "fee"].includes(sort)) {
      res.status(400).json({
        success: false,
        message: "Unsupported doctor sort order",
      });
      return;
    }

    const query = Doctor.find();
    if (search) {
      const expression = new RegExp(escapeRegExp(search), "i");
      const matchingUsers = await User.find({
        name: expression,
        isActive: true,
      }).select("_id");
      query.or([
        { specialization: expression },
        { department: expression },
        { qualification: expression },
        { bio: expression },
        { userId: { $in: matchingUsers.map((user) => user._id) } },
      ]);
    }
    if (specialization) {
      query.where({
        specialization: new RegExp(`^${escapeRegExp(specialization)}$`, "i"),
      });
    }
    if (department) {
      query.where({
        department: new RegExp(`^${escapeRegExp(department)}$`, "i"),
      });
    }
    if (availability !== undefined) {
      query.where({ isAvailable: availability === "true" });
    }

    const doctorRecords = await query
      .select("-licenseNumber")
      .sort({ createdAt: -1 })
      .lean();

    const users = await User.find({
      _id: { $in: doctorRecords.map((doctor) => doctor.userId) },
      isActive: true,
    })
      .select("name")
      .lean();
    const usersById = new Map(
      users.map((user) => [user._id.toString(), user]),
    );
    const doctors = doctorRecords.flatMap((doctor) => {
      const user = usersById.get(doctor.userId.toString());
      return user
        ? [
            {
              ...doctor,
              userId: {
                _id: doctor.userId.toString(),
                name: user.name,
              },
            },
          ]
        : [];
    });

    if (sort !== "newest") {
      const direction = sort === "fee" ? 1 : -1;
      doctors.sort((first, second) => {
        if (sort === "name") {
          return first.userId.name.localeCompare(second.userId.name);
        }

        const field =
          sort === "experience" ? "experienceYears" : "consultationFee";
        return direction * (first[field] - second[field]);
      });
    }

    res.status(200).json({
      success: true,
      count: doctors.length,
      doctors,
    });
  } catch (error) {
    console.error(
      "Get doctors error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch doctors",
    });
  }
};

export const getMyDoctorProfile = async (
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
    const doctor = await Doctor.findOne({ userId: req.user.id }).populate(
      "userId",
      "name",
    );

    if (!doctor) {
      res.status(404).json({
        success: false,
        message: "Doctor profile not found",
      });
      return;
    }

    res.status(200).json({ success: true, doctor });
  } catch (error) {
    console.error(
      "Get own doctor profile error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch doctor profile",
    });
  }
};

// Get doctor by ID
export const getDoctorById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({
        success: false,
        message: "Invalid doctor ID",
      });
      return;
    }

    const doctor = await Doctor.findById(req.params.id)
      .select("-licenseNumber")
      .lean();

    if (!doctor) {
      res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
      return;
    }

    const user = await User.findOne({
      _id: doctor.userId,
      isActive: true,
    })
      .select("name")
      .lean();

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      doctor: {
        ...doctor,
        userId: {
          _id: doctor.userId.toString(),
          name: user.name,
        },
      },
    });
  } catch (error) {
    console.error(
      "Get doctor error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch doctor",
    });
  }
};

// Update doctor profile
export const updateDoctor = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const doctor = await Doctor.findOne({
      userId: req.user.id,
    });

    if (!doctor) {
      res.status(404).json({
        success: false,
        message: "Doctor profile not found",
      });
      return;
    }

    const parsed = updateDoctorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid doctor profile fields",
      });
      return;
    }

    Object.assign(doctor, parsed.data);
    await doctor.save();
    await doctor.populate("userId", "name");

    res.status(200).json({
      success: true,
      message: "Doctor profile updated successfully",
      doctor: {
        ...doctor.toObject(),
        licenseNumber: undefined,
      },
    });
  } catch (error) {
    console.error(
      "Update doctor error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    res.status(500).json({
      success: false,
      message: "Failed to update doctor profile",
    });
  }
};

// Get distinct hospital departments
export const getDepartments = async (
  _req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const rawDepartments = await Doctor.distinct("department");
    const validDepts = rawDepartments.filter(
      (d): d is string => typeof d === "string" && d.trim().length > 0,
    );
    const defaults = [
      "General Medicine",
      "Cardiology",
      "Dermatology",
      "Pediatrics",
      "Neurology",
      "Orthopedics",
      "Psychiatry",
      "Gynecology",
      "Ophthalmology",
      "ENT",
    ];
    const combined = Array.from(new Set([...defaults, ...validDepts])).sort();

    res.status(200).json({
      success: true,
      departments: combined,
    });
  } catch (error) {
    console.error("Get departments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
    });
  }
};