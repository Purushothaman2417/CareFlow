
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { createServer } from "http";

import authRoutes from "./routes/authRoutes";
import testRoutes from "./routes/testRoutes";
import doctorRoutes from "./routes/doctorRoutes";
import scheduleRoutes from "./routes/scheduleRoutes";
import appointmentRoutes from "./routes/appointmentRoutes";
import queueRoutes from "./routes/queueRoutes";
import consultationRoutes from "./routes/consultationRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import medicalRecordRoutes from "./routes/medicalRecordRoutes";
import insightsRoutes from "./routes/insightsRoutes";
import assistantRoutes from "./routes/assistantRoutes";
import carePlanRoutes from "./routes/carePlanRoutes";
import adminRoutes from "./routes/adminRoutes";

import { connectDB } from "./config/db";
import { connectRedis } from "./config/redis";
import { isAllowedClientOrigin } from "./config/cors";
import { initializeSocket } from "./sockets/socket";

if (process.env.CAREFLOW_DEMO_MODE !== "true") {
  dotenv.config();
}

const app = express();
const PORT = Number(process.env.PORT) || 8000;

// Security middleware
app.use(helmet());

// CORS configuration
const clientUrl = process.env.CLIENT_URL || "http://localhost:8080";
const allowedClientOrigins = Array.from(
  new Set([
    clientUrl,
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ])
);

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedClientOrigin(origin, allowedClientOrigins));
    },
    credentials: true,
  })
);

// Request body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Rate limiting
// Root and Health endpoints (not rate limited)
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "CareFlow API is running",
    version: "1.0.0",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "CareFlow Backend",
    database: "MongoDB",
    status: "healthy",
  });
});

// Rate limiting (generous for development, strict for production)
const isDevelopment = process.env.NODE_ENV !== "production" || process.env.CAREFLOW_DEMO_MODE === "true";
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 10000 : 100,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api", limiter);

// Register API routes
app.use("/api/auth", authRoutes);
app.use("/api/test", testRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/medical-records", medicalRecordRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/care-plans", carePlanRoutes);
app.use("/api/admin", adminRoutes);

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Connect to databases
    await connectDB();
    await connectRedis();

    // Create the HTTP server once
    const httpServer = createServer(app);

    // Initialize Socket.IO once
    initializeSocket(httpServer, allowedClientOrigins);

    // Start listening
    httpServer.listen(PORT, () => {
      console.log(
        `CareFlow server running on http://localhost:${PORT}`
      );
    });

    // Handle server startup errors
    httpServer.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Stop the other process or change PORT in your .env file.`
        );
      } else {
        console.error("HTTP server error:", error);
      }

      process.exit(1);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
