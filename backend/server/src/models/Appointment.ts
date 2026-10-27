import mongoose, { Document, Schema } from "mongoose";

export interface IAppointment extends Document {
  patientId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  reason?: string;
  visitGoals?: string;
  symptoms?: string;
  allergies?: string;
  medications?: string;
  questions?: string;
  status:
    | "scheduled"
    | "confirmed"
    | "rejected"
    | "completed"
    | "cancelled"
    | "no_show";
  rejectionReason?: string;
  auditTrail?: Array<{
    action: string;
    performedBy?: mongoose.Types.ObjectId;
    role?: string;
    timestamp: Date;
    note?: string;
  }>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const appointmentSchema = new Schema<IAppointment>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },

    appointmentDate: {
      type: Date,
      required: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    visitGoals: { type: String, trim: true, maxlength: 1000 },
    symptoms: { type: String, trim: true, maxlength: 2000 },
    allergies: { type: String, trim: true, maxlength: 1000 },
    medications: { type: String, trim: true, maxlength: 1000 },
    questions: { type: String, trim: true, maxlength: 1000 },

    status: {
      type: String,
      enum: [
        "scheduled",
        "confirmed",
        "rejected",
        "completed",
        "cancelled",
        "no_show",
      ],
      default: "scheduled",
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    auditTrail: [
      {
        action: { type: String, required: true },
        performedBy: { type: Schema.Types.ObjectId, ref: "User" },
        role: { type: String },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, maxlength: 500 },
      },
    ],

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

// The guarded migration replaces the legacy all-status index with this
// active-status-only constraint so terminal appointments release their slots.
appointmentSchema.index(
  {
    doctorId: 1,
    appointmentDate: 1,
    startTime: 1,
  },
  {
    unique: true,
    name: "active_appointment_slot_unique_v1",
    partialFilterExpression: {
      status: { $in: ["scheduled", "confirmed"] },
    },
  }
);

export const Appointment = mongoose.model<IAppointment>(
  "Appointment",
  appointmentSchema
);