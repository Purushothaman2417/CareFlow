import mongoose, { Document, Schema } from "mongoose";

export interface IDoctor extends Document {
  userId: mongoose.Types.ObjectId;
  specialization: string;
  department?: string;
  qualification: string;
  experienceYears: number;
  licenseNumber: string;
  consultationFee: number;
  bio?: string;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const doctorSchema = new Schema<IDoctor>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    specialization: {
      type: String,
      required: true,
      trim: true,
    },

    department: {
      type: String,
      trim: true,
      default: "General Medicine",
    },

    qualification: {
      type: String,
      required: true,
      trim: true,
    },

    experienceYears: {
      type: Number,
      required: true,
      min: 0,
    },

    licenseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    consultationFee: {
      type: Number,
      required: true,
      min: 0,
    },

    bio: {
      type: String,
      trim: true,
      maxlength: 1000,
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

export const Doctor = mongoose.model<IDoctor>(
  "Doctor",
  doctorSchema
);