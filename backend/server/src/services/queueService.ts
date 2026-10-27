import mongoose from "mongoose";

import QueueEntry, { type IQueueEntry } from "../models/QueueEntry";
import { emitQueueUpdate } from "../sockets/socket";

type QueueEntryChange =
  | { blocked: true }
  | { blocked: false; cancelledEntry: IQueueEntry | null };

export async function hasActiveQueueEntry(
  appointmentId: mongoose.Types.ObjectId,
): Promise<boolean> {
  return Boolean(
    await QueueEntry.exists({
      appointmentId,
      status: { $in: ["waiting", "called", "in_consultation"] },
    }),
  );
}

export async function cancelWaitingQueueEntry(
  appointmentId: mongoose.Types.ObjectId,
): Promise<QueueEntryChange> {
  const existingEntry = await QueueEntry.findOne({ appointmentId });
  if (!existingEntry) {
    return { blocked: false, cancelledEntry: null };
  }

  if (
    existingEntry.status === "called" ||
    existingEntry.status === "in_consultation"
  ) {
    return { blocked: true };
  }
  if (existingEntry.status !== "waiting") {
    return { blocked: false, cancelledEntry: null };
  }

  const cancelledEntry = await QueueEntry.findOneAndUpdate(
    { _id: existingEntry._id, status: "waiting" },
    { $set: { status: "cancelled" } },
    { new: true },
  );
  if (cancelledEntry) {
    emitQueueUpdate("PATIENT_CANCELLED", cancelledEntry);
    return { blocked: false, cancelledEntry };
  }

  const latestEntry = await QueueEntry.findById(existingEntry._id).select("status");
  return {
    blocked:
      latestEntry?.status === "called" ||
      latestEntry?.status === "in_consultation",
    cancelledEntry: null,
  };
}

export async function restoreQueueEntry(
  entry: IQueueEntry | null,
): Promise<void> {
  if (!entry) return;

  const restoredEntry = await QueueEntry.findOneAndUpdate(
    { _id: entry._id, status: "cancelled" },
    { $set: { status: "waiting" } },
    { new: true },
  );
  if (restoredEntry) emitQueueUpdate("PATIENT_REQUEUED", restoredEntry);
}
