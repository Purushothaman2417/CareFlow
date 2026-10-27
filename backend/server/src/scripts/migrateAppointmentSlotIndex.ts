import "dotenv/config";
import mongoose from "mongoose";

const LEGACY_INDEX_NAME =
  "doctorId_1_appointmentDate_1_startTime_1";
const ACTIVE_INDEX_NAME = "active_appointment_slot_unique_v1";
const ACTIVE_STATUSES = ["scheduled", "confirmed"];

async function migrateAppointmentSlotIndex(): Promise<void> {
  if (process.env.ALLOW_APPOINTMENT_SLOT_INDEX_MIGRATION !== "true") {
    throw new Error(
      "Set ALLOW_APPOINTMENT_SLOT_INDEX_MIGRATION=true to explicitly allow the appointment index migration",
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  await mongoose.connect(uri);
  const collection = mongoose.connection.db?.collection("appointments");
  if (!collection) throw new Error("Appointments collection is unavailable");

  const indexes = await collection.indexes();
  const existingActiveIndex = indexes.find(
    (index) => index.name === ACTIVE_INDEX_NAME,
  );
  const hasAppointmentSlotKeys = (index: (typeof indexes)[number]) =>
    index.key?.doctorId === 1 &&
    index.key?.appointmentDate === 1 &&
    index.key?.startTime === 1 &&
    Object.keys(index.key).length === 3;
  const legacyIndex = indexes.find(
    (index) =>
      index.name === LEGACY_INDEX_NAME &&
      index.unique === true &&
      hasAppointmentSlotKeys(index),
  );
  const namedLegacyIndex = indexes.find(
    (index) => index.name === LEGACY_INDEX_NAME,
  );
  if (namedLegacyIndex && !legacyIndex) {
    throw new Error(
      "The legacy appointment slot index does not match its expected definition",
    );
  }
  if (
    existingActiveIndex &&
    (existingActiveIndex.unique !== true ||
      !hasAppointmentSlotKeys(existingActiveIndex) ||
      JSON.stringify(existingActiveIndex.partialFilterExpression) !==
        JSON.stringify({ status: { $in: ACTIVE_STATUSES } }))
  ) {
    throw new Error(
      "The active appointment slot index does not match its expected definition",
    );
  }

  if (indexes.some(
    (index) =>
      index.unique === true &&
      index.name !== ACTIVE_INDEX_NAME &&
      hasAppointmentSlotKeys(index) &&
      index.name !== LEGACY_INDEX_NAME,
  )) {
    throw new Error(
      "Found an unrecognized unique appointment slot index; refusing to replace it automatically",
    );
  }

  const duplicates = await collection
    .aggregate<{ _id: unknown; count: number }>([
      {
        $match: {
          status: { $in: ACTIVE_STATUSES },
        },
      },
      {
        $group: {
          _id: {
            doctorId: "$doctorId",
            appointmentDate: "$appointmentDate",
            startTime: "$startTime",
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ])
    .toArray();

  if (duplicates.length > 0) {
    throw new Error(
      "Duplicate active appointment slots exist; resolve them before migrating the index",
    );
  }

  if (!existingActiveIndex) {
    await collection.createIndex(
      { doctorId: 1, appointmentDate: 1, startTime: 1 },
      {
        unique: true,
        name: ACTIVE_INDEX_NAME,
        partialFilterExpression: {
          status: { $in: ACTIVE_STATUSES },
        },
      },
    );
    console.log("Created the active appointment slot index.");
  }

  if (legacyIndex) {
    await collection.dropIndex(LEGACY_INDEX_NAME);
    console.log("Removed the legacy all-status appointment slot index.");
  }
}

migrateAppointmentSlotIndex()
  .catch((error: unknown) => {
    console.error(
      "Appointment index migration failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
