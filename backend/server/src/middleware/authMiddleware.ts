import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { User, type IUser } from "../models/User";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: IUser["role"];
  };
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());

  if (!match) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({
      success: false,
      message: "JWT secret is not configured",
    });
    return;
  }

  let userId: string;
  let tokenVersion: number;
  try {
    const decoded = jwt.verify(match[1], secret);
    if (typeof decoded === "string" || typeof decoded.userId !== "string") {
      res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
      return;
    }
    if (
      decoded.authVersion !== undefined &&
      typeof decoded.authVersion !== "number"
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
      return;
    }
    userId = decoded.userId;
    tokenVersion = decoded.authVersion ?? 0;
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) {
      throw error;
    }

    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
    return;
  }

  const user = await User.findById(userId);

  if (!user) {
    res.status(401).json({
      success: false,
      message: "User not found",
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

  if (tokenVersion !== user.authVersion) {
    res.status(401).json({
      success: false,
      message: "Session expired. Please sign in again.",
    });
    return;
  }

  req.user = {
    id: user._id.toString(),
    role: user.role,
  };

  next();
};

export const authorize = (...roles: IUser["role"][]) => {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
      return;
    }

    next();
  };
};