import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client, TokenPayload } from "google-auth-library";
import { z } from "zod";

import { AuthRequest } from "../middleware/authMiddleware";
import { User } from "../models/User";
import { disconnectUserSockets } from "../sockets/socket";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
  phone: z.string().trim().max(32).optional(),
  role: z.enum(["patient", "doctor"]).optional().default("patient"),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const googleLoginSchema = z
  .object({
    credential: z.string().min(1).max(8192),
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict()
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current password",
  });

const updateCurrentUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().max(32).optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    gender: z.enum(["Female", "Male", "Other"]).nullable().optional(),
    bloodGroup: z
      .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
      .nullable()
      .optional(),
    address: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0);

const isDuplicateKeyError = (
  error: unknown,
): error is { code: number } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

const generateToken = (userId: string, authVersion = 0): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      userId,
      authVersion,
    },
    secret,
    {
      expiresIn: "1d",
    }
  );
};

// Register
export const register = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message:
          "Provide a valid name, email, password of at least 6 characters, and patient or doctor role",
      });
      return;
    }
    const { name, email, password, phone, role } = parsed.data;

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "User already exists",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      role,
    });

    const token = generateToken(user._id.toString(), user.authVersion);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      res.status(409).json({
        success: false,
        message: "User already exists",
      });
      return;
    }

    console.error(
      "Register error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

// Login
export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Provide a valid email and password",
      });
      return;
    }
    const { email, password } = parsed.data;

    const user = await User.findOne({
      email: email.toLowerCase(),
    }).select("+password");

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
      return;
    }

    const passwordMatch =
      user.password !== undefined &&
      (await bcrypt.compare(password, user.password));

    if (!passwordMatch) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const token = generateToken(user._id.toString(), user.authVersion);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(
      "Login error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

export const loginWithGoogle = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const parsed = googleLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Provide a valid Google sign-in credential",
    });
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({
      success: false,
      message: "Google sign-in is not configured on the server",
    });
    return;
  }

  let payload: TokenPayload | undefined;
  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({
      idToken: parsed.data.credential,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch (error) {
    console.error(
      "Google token verification error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(401).json({
      success: false,
      message: "Google sign-in could not be verified",
    });
    return;
  }

  if (
    !payload?.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    !payload.name
  ) {
    res.status(401).json({
      success: false,
      message: "Google did not provide a verified email and profile",
    });
    return;
  }

  try {
    const email = payload.email.trim().toLowerCase();
    let user = await User.findOne({ googleId: payload.sub }).select("+googleId");
    if (!user) {
      const matchingEmail = await User.findOne({ email }).select("+googleId");
      if (matchingEmail?.googleId && matchingEmail.googleId !== payload.sub) {
        res.status(409).json({
          success: false,
          message: "This email is already linked to a different Google account",
        });
        return;
      }

      if (matchingEmail) {
        user = matchingEmail.googleId
          ? matchingEmail
          : await User.findOneAndUpdate(
              { _id: matchingEmail._id, googleId: { $exists: false } },
              { $set: { googleId: payload.sub } },
              { new: true },
            ).select("+googleId");
        if (!user) {
          user = await User.findOne({ googleId: payload.sub }).select("+googleId");
        }
        if (!user) {
          res.status(409).json({
            success: false,
            message: "This account changed while signing in. Please try again.",
          });
          return;
        }
      } else {
        user = await User.create({
          name: payload.name,
          email,
          googleId: payload.sub,
          role: "patient",
          isActive: true,
        });
      }
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: "Account is inactive",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Google sign-in successful",
      token: generateToken(user._id.toString(), user.authVersion),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      res.status(409).json({
        success: false,
        message: "This Google account is already linked to another CareFlow account",
      });
      return;
    }
    console.error(
      "Google login error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Google sign-in failed",
    });
  }
};
export const getMe = async (
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

    const user = await User.findById(req.user.id);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10),
        gender: user.gender,
        bloodGroup: user.bloodGroup,
        address: user.address,
      },
    });
  } catch (error) {
    console.error(
      "Get current user error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    res.status(500).json({
      success: false,
      message: "Unable to fetch user",
    });
  }
};

export const updateMe = async (
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

  const parsed = updateCurrentUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Provide a valid name or phone number",
    });
    return;
  }

  try {
    const patientFields = [
      "dateOfBirth",
      "gender",
      "bloodGroup",
      "address",
    ] as const;
    const includesPatientFields = patientFields.some(
      (field) => parsed.data[field] !== undefined,
    );
    if (includesPatientFields && req.user.role !== "patient") {
      res.status(403).json({
        success: false,
        message: "Only patients can update patient profile fields",
      });
      return;
    }

    const update: Record<string, unknown> = { ...parsed.data };
    const unset: Record<string, 1> = {};
    if (parsed.data.dateOfBirth === null) {
      delete update.dateOfBirth;
      unset.dateOfBirth = 1;
    } else if (parsed.data.dateOfBirth) {
      const date = new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`);
      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== parsed.data.dateOfBirth
      ) {
        res.status(400).json({
          success: false,
          message: "Provide a valid date of birth",
        });
        return;
      }
      if (date > new Date()) {
        res.status(400).json({
          success: false,
          message: "Date of birth cannot be in the future",
        });
        return;
      }
      update.dateOfBirth = date;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        ...(Object.keys(update).length > 0 ? { $set: update } : {}),
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { new: true, runValidators: true },
    ).select("name email role phone dateOfBirth gender bloodGroup address");

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10),
        gender: user.gender,
        bloodGroup: user.bloodGroup,
        address: user.address,
      },
    });
  } catch (error) {
    console.error(
      "Update current user error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
};

export const changePassword = async (
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

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Provide your current password and a new password of at least 8 characters",
    });
    return;
  }

  try {
    const user = await User.findById(req.user.id).select("+password");
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const currentPasswordMatches = await bcrypt.compare(
      parsed.data.currentPassword,
      user.password ?? "",
    );
    if (!currentPasswordMatches) {
      res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
      return;
    }

    const authVersion = user.authVersion ?? 0;
    const versionFilter =
      authVersion === 0
        ? {
            $or: [
              { authVersion: 0 },
              { authVersion: { $exists: false } },
            ],
          }
        : { authVersion };
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, ...versionFilter },
      {
        $set: {
          password: await bcrypt.hash(parsed.data.newPassword, 12),
        },
        $inc: { authVersion: 1 },
      },
      { new: true, runValidators: true },
    );

    if (!updatedUser) {
      res.status(409).json({
        success: false,
        message: "Password was changed by another request. Please sign in again.",
      });
      return;
    }

    disconnectUserSockets(updatedUser._id.toString());

    res.status(200).json({
      success: true,
      message: "Password updated. Other sessions have been signed out.",
      token: generateToken(updatedUser._id.toString(), updatedUser.authVersion),
    });
  } catch (error) {
    console.error(
      "Change password error:",
      error instanceof Error ? error.name : "Unknown error",
    );
    res.status(500).json({
      success: false,
      message: "Unable to update password",
    });
  }
};