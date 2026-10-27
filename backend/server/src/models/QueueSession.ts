import mongoose, { Document, Schema } from "mongoose";

export interface IQueueSession extends Document {
  doctorId: mongoose.Types.ObjectId;
  date: Date;
  status: "open" | "closed";
  currentNumber: number;
  totalPatients: number;
  nextQueueNumber?: number;
  createdAt: Date;
  updatedAt: Date;
}

const queueSessionSchema = new Schema<IQueueSession>(
  {
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },

    date: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },

    currentNumber: {
      type: Number,
      default: 0,
    },

    totalPatients: {
      type: Number,
      default: 0,
    },

    nextQueueNumber: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

queueSessionSchema.index(
  { doctorId: 1, date: 1 },
  { unique: true }
);

export default mongoose.model<IQueueSession>(
  "QueueSession",
  queueSessionSchema
);