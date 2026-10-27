import mongoose, { Document, Schema } from "mongoose";

export interface IQueueEntry extends Document {
  queueSessionId: mongoose.Types.ObjectId;
  appointmentId: mongoose.Types.ObjectId;
  patientId: mongoose.Types.ObjectId;
  queueNumber: number;
  status:
    | "waiting"
    | "called"
    | "in_consultation"
    | "completed"
    | "skipped"
    | "cancelled";
  checkedInAt?: Date;
  calledAt?: Date;
  completedAt?: Date;
  skipReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const queueEntrySchema = new Schema<IQueueEntry>(
  {
    queueSessionId: {
      type: Schema.Types.ObjectId,
      ref: "QueueSession",
      required: true,
    },

    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: "Appointment",
      required: true,
    },

    patientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    queueNumber: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "waiting",
        "called",
        "in_consultation",
        "completed",
        "skipped",
        "cancelled",
      ],
      default: "waiting",
    },

    checkedInAt: Date,
    calledAt: Date,
    completedAt: Date,
    skipReason: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
  }
);

queueEntrySchema.index(
  { queueSessionId: 1, queueNumber: 1 },
  { unique: true }
);

queueEntrySchema.index(
  { appointmentId: 1 },
  { unique: true }
);

export default mongoose.model<IQueueEntry>(
  "QueueEntry",
  queueEntrySchema
);