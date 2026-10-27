import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Server } from "socket.io";

import { User } from "../models/User";
import { Doctor } from "../models/Doctor";
import QueueSession from "../models/QueueSession";
import type { IQueueEntry } from "../models/QueueEntry";
import { isAllowedClientOrigin } from "../config/cors";

let io: Server;

type QueueUpdateType =
  | "PATIENT_CHECKED_IN"
  | "PATIENT_CALLED"
  | "PATIENT_IN_CONSULTATION"
  | "PATIENT_SKIPPED"
  | "PATIENT_CANCELLED"
  | "PATIENT_REQUEUED"
  | "PATIENT_COMPLETED";

export const initializeSocket = (
  httpServer: HttpServer,
  allowedClientOrigins: string[],
) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isAllowedClientOrigin(origin, allowedClientOrigins));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const authToken = socket.handshake.auth.token;
    const authorization = socket.handshake.headers.authorization;
    const headerToken =
      typeof authorization === "string"
        ? /^Bearer\s+(\S+)$/i.exec(authorization.trim())?.[1]
        : undefined;
    const token =
      typeof authToken === "string" && authToken.length > 0
        ? authToken
        : headerToken;
    const secret = process.env.JWT_SECRET;

    if (!token || !secret) {
      next(new Error("Authentication required"));
      return;
    }

    let decoded: jwt.JwtPayload;
    try {
      const verified = jwt.verify(token, secret);
      if (
        typeof verified === "string" ||
        typeof verified.userId !== "string" ||
        (verified.authVersion !== undefined &&
          typeof verified.authVersion !== "number")
      ) {
        next(new Error("Invalid or expired token"));
        return;
      }
      decoded = verified;
    } catch (error) {
      if (!(error instanceof jwt.JsonWebTokenError)) {
        console.error(
          "Socket token verification error:",
          error instanceof Error ? error.name : "Unknown error",
        );
        next(new Error("Unable to authenticate connection"));
        return;
      }

      next(new Error("Invalid or expired token"));
      return;
    }

    try {
      const user = await User.findById(decoded.userId).select("_id role isActive authVersion");
      if (!user || !user.isActive) {
        next(new Error("Account is unavailable"));
        return;
      }
      if ((decoded.authVersion ?? 0) !== user.authVersion) {
        next(new Error("Session expired. Please sign in again."));
        return;
      }

      socket.data.userId = user._id.toString();
      socket.data.role = user.role;
      await socket.join(`user:${user._id}`);
      next();
    } catch (error) {
      console.error(
        "Socket account lookup error:",
        error instanceof Error ? error.name : "Unknown error",
      );
      next(new Error("Unable to authenticate connection"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("joinQueue", async (queueId: unknown) => {
      const userId = socket.data.userId;
      const role = socket.data.role;
      if (
        typeof queueId !== "string" ||
        !mongoose.isValidObjectId(queueId) ||
        !["doctor", "admin", "receptionist"].includes(role)
      ) {
        socket.emit("socketError", {
          message: "Only clinical and administrative staff can join queue updates",
        });
        return;
      }

      try {
        if (role === "doctor") {
          const doctor = await Doctor.findOne({ userId });
          if (!doctor) {
            socket.emit("socketError", { message: "Doctor profile not found" });
            return;
          }

          const queue = await QueueSession.findOne({
            _id: queueId,
            doctorId: doctor._id,
          }).select("_id");
          if (!queue) {
            socket.emit("socketError", {
              message: "You are not authorized to join this queue",
            });
            return;
          }

          await socket.join(`queue:${queue._id}`);
        } else {
          // Receptionists and admins can monitor existing active queues
          const queue = await QueueSession.findById(queueId).select("_id");
          if (!queue) {
            socket.emit("socketError", { message: "Queue session not found" });
            return;
          }
          await socket.join(`queue:${queue._id}`);
        }
      } catch (error) {
        console.error(
          "Socket queue authorization error:",
          error instanceof Error ? error.name : "Unknown error",
        );
        socket.emit("socketError", {
          message: "Unable to join the queue",
        });
      }
    });

    socket.on("leaveQueue", async (queueId: unknown) => {
      if (typeof queueId !== "string" || !mongoose.isValidObjectId(queueId)) {
        return;
      }
      await socket.leave(`queue:${queueId}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }
  return io;
};

export const emitQueueUpdate = (
  type: QueueUpdateType,
  entry: IQueueEntry,
) => {
  const queueId = entry.queueSessionId.toString();
  const patientId = entry.patientId.toString();

  getIO().to(`queue:${queueId}`).emit("queueUpdated", {
    type,
    queueId,
    entry,
  });
  getIO().to(`user:${patientId}`).emit("queueUpdated", {
    type,
    queueId,
    queueNumber: entry.queueNumber,
    status: entry.status,
  });
};

export const disconnectUserSockets = (userId: string) => {
  getIO().in(`user:${userId}`).disconnectSockets(true);
};
