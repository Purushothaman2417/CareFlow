import mongoose, { Document, Schema } from "mongoose";

export interface IConsultation extends Document {
  appointmentId: mongoose.Types.ObjectId;
  patientId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  symptoms?: string;
  diagnosis?: string;
  prescription?: string;
  notes?: string;
  followUpDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const consultationSchema = new Schema<IConsultation>(
  {
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
      unique: true,
    },

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

    symptoms: {
      type: String,
      trim: true,
    },

    diagnosis: {
      type: String,
      trim: true,
    },

    prescription: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },

    followUpDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Consultation = mongoose.model<IConsultation>(
  "Consultation",
  consultationSchema
);