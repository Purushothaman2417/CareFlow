import mongoose, { Document, Schema } from "mongoose";

export interface ICarePlanTask {
  _id: mongoose.Types.ObjectId;
  title: string;
  dueDate?: Date;
  status: "pending" | "completed";
  completedAt?: Date;
}

export interface ICarePlanMedication {
  _id: mongoose.Types.ObjectId;
  name: string;
  dosage: string;
  schedule: string;
  instructions?: string;
  startDate: Date;
  endDate?: Date;
  takenDates: string[];
}

export interface ICarePlan extends Document {
  patientId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  title: string;
  notes?: string;
  tasks: ICarePlanTask[];
  medications: ICarePlanMedication[];
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ICarePlanTask>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    dueDate: Date,
    status: { type: String, enum: ["pending", "completed"], default: "pending" },
    completedAt: Date,
  },
  { _id: true },
);

const medicationSchema = new Schema<ICarePlanMedication>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    dosage: { type: String, required: true, trim: true, maxlength: 100 },
    schedule: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, trim: true, maxlength: 1000 },
    startDate: { type: Date, required: true },
    endDate: Date,
    takenDates: { type: [String], default: [] },
  },
  { _id: true },
);

const carePlanSchema = new Schema<ICarePlan>(
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
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 2000 },
    tasks: { type: [taskSchema], default: [] },
    medications: { type: [medicationSchema], default: [] },
  },
  { timestamps: true },
);

carePlanSchema.index({ patientId: 1, createdAt: -1 });
carePlanSchema.index({ doctorId: 1, createdAt: -1 });

export const CarePlan = mongoose.model<ICarePlan>("CarePlan", carePlanSchema);
