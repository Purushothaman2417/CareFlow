import mongoose, { Document, Schema } from "mongoose";

export interface IDoctorSchedule extends Document {
  doctorId: mongoose.Types.ObjectId;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const doctorScheduleSchema = new Schema<IDoctorSchedule>(
  {
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },

    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },

    // Example: "09:00"
    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },

    // Example: "13:00"
    endTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },

    // Appointment duration in minutes
    slotDuration: {
      type: Number,
      required: true,
      min: 5,
      max: 120,
      default: 30,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate schedule for the same doctor/day/time
doctorScheduleSchema.index(
  {
    doctorId: 1,
    dayOfWeek: 1,
    startTime: 1,
    endTime: 1,
  },
  {
    unique: true,
  }
);

export const DoctorSchedule = mongoose.model<IDoctorSchedule>(
  "DoctorSchedule",
  doctorScheduleSchema
);