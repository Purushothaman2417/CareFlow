import mongoose, { Document, Schema } from "mongoose";

export interface IMedicalRecord extends Document {
  patientId: mongoose.Types.ObjectId;
  doctorId?: mongoose.Types.ObjectId;
  title: string;
  description: string;
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const medicalRecordSchema = new Schema<IMedicalRecord>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    recordedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

medicalRecordSchema.index({ patientId: 1, recordedAt: -1 });
medicalRecordSchema.index({ doctorId: 1, recordedAt: -1 });

export const MedicalRecord = mongoose.model<IMedicalRecord>(
  "MedicalRecord",
  medicalRecordSchema,
);
