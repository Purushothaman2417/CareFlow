import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { Appointment } from "../models/Appointment";
import { CarePlan } from "../models/CarePlan";
import { Consultation } from "../models/Consultation";
import { Doctor } from "../models/Doctor";
import { DoctorSchedule } from "../models/DoctorSchedule";
import { MedicalRecord } from "../models/MedicalRecord";
import { Notification } from "../models/Notification";
import QueueEntry from "../models/QueueEntry";
import QueueSession from "../models/QueueSession";
import { User } from "../models/User";
import { assertLocalDemoDatabaseUri } from "./demoEnvironment";
import {
  clinicDateKey,
  parseDateOnly,
} from "../services/scheduling";

const doctorSeeds = [
  ["Asha Menon", "General Medicine", "MBBS, MD Medicine", 12],
] as const;

const patientNames = [
  "Aarav Patel",
  "Diya Rao",
  "Ishaan Gupta",
  "Mira Kapoor",
] as const;

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const DEMO_EMAIL_DOMAIN = "careflow.test";
const demoAppointmentPlans = [
  { days: -7, time: "09:00", status: "completed", patient: 0 },
  { days: -7, time: "09:30", status: "completed", patient: 1 },
  { days: -7, time: "10:00", status: "completed", patient: 2 },
  { days: -7, time: "10:30", status: "completed", patient: 3 },
  { days: 0, time: "09:00", status: "confirmed", patient: 0 },
  { days: 0, time: "09:30", status: "confirmed", patient: 1 },
  { days: 0, time: "10:00", status: "confirmed", patient: 2 },
  { days: 0, time: "10:30", status: "confirmed", patient: 3 },
  { days: 0, time: "11:00", status: "confirmed", patient: 0 },
  { days: 0, time: "11:30", status: "confirmed", patient: 1 },
  { days: 0, time: "12:00", status: "confirmed", patient: 2 },
  { days: 0, time: "12:30", status: "confirmed", patient: 3 },
  { days: 7, time: "09:00", status: "scheduled", patient: 0 },
  { days: 7, time: "09:30", status: "scheduled", patient: 1 },
  { days: 7, time: "10:00", status: "scheduled", patient: 2 },
  { days: 14, time: "10:00", status: "cancelled", patient: 3 },
] as const;

const patientStories = [
  {
    reason: "Intermittent tiredness; routine health review.",
    history: "Reports intermittent tiredness over the past month.",
    allergies: "No known allergies reported.",
    medications: "No regular medications reported.",
    vitals: "Blood pressure 118/76 mmHg; pulse 72 bpm; temperature 36.7 C.",
  },
  {
    reason: "Mild headache; routine health review.",
    history: "Reports occasional mild headaches, without a prior assessment on file.",
    allergies: "Seasonal pollen sensitivity reported.",
    medications: "No regular medications reported.",
    vitals: "Blood pressure 116/74 mmHg; pulse 76 bpm; temperature 36.8 C.",
  },
  {
    reason: "Recent cough; routine health review.",
    history: "Reports a recent cough and no difficulty breathing.",
    allergies: "No known allergies reported.",
    medications: "No regular medications reported.",
    vitals: "Blood pressure 120/78 mmHg; pulse 80 bpm; temperature 37.0 C.",
  },
  {
    reason: "Mild knee soreness after activity; routine health review.",
    history: "Reports occasional knee soreness after activity, with no recent fall.",
    allergies: "Adhesive sensitivity reported.",
    medications: "No regular medications reported.",
    vitals: "Blood pressure 114/72 mmHg; pulse 70 bpm; temperature 36.6 C.",
  },
] as const;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function appointmentDate(date: Date): Date {
  const parsed = parseDateOnly(date.toISOString().slice(0, 10));
  if (!parsed) throw new Error("Unable to construct a valid demo appointment date");
  return parsed;
}

async function getOrCreateDemoUser(
  email: string,
  name: string,
  role: "doctor" | "patient",
  passwordHash: string,
  password: string,
  profile?: {
    phone: string;
    dateOfBirth: Date;
    gender: "Female" | "Male" | "Other";
    bloodGroup: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
    address: string;
  },
) {
  const existing = await User.findOne({ email }).select("+password");
  if (existing) {
    if (
      existing.role !== role ||
      !existing.password ||
      !(await bcrypt.compare(password, existing.password))
    ) {
      throw new Error(
        `Existing account ${email} is not a matching demo account; refusing to modify it`,
      );
    }
    if (profile) {
      if (!existing.phone) existing.phone = profile.phone;
      if (!existing.dateOfBirth) existing.dateOfBirth = profile.dateOfBirth;
      if (!existing.gender) existing.gender = profile.gender;
      if (!existing.bloodGroup) existing.bloodGroup = profile.bloodGroup;
      if (!existing.address) existing.address = profile.address;
      await existing.save();
    }
    return existing;
  }

  return User.create({
    name,
    email,
    password: passwordHash,
    role,
    isActive: true,
    ...(profile ?? {}),
  });
}

async function ensureDemoStaffAccount(
  email: string,
  name: string,
  role: "admin" | "receptionist",
  passwordHash: string,
  password: string,
) {
  const existing = await User.findOne({ email }).select("+password");
  if (existing) {
    if (existing.role !== role) {
      throw new Error(
        `Existing account ${email} has a different role; refusing to modify it`,
      );
    }

    if (
      !existing.password ||
      !(await bcrypt.compare(password, existing.password))
    ) {
      existing.password = passwordHash;
      existing.authVersion = (existing.authVersion ?? 0) + 1;
      await existing.save();
    }
    return existing;
  }

  return User.create({
    name,
    email,
    password: passwordHash,
    role,
    isActive: true,
    authVersion: 0,
  });
}

async function clearExistingDemoFixtures(): Promise<void> {
  const existingUsers = await User.find({
    email: /^demo\.(doctor|patient)\.\d{2}@careflow\.test$/i,
  }).select("_id");
  const userIds = existingUsers.map((user) => user._id);
  if (userIds.length === 0) return;

  const doctors = await Doctor.find({ userId: { $in: userIds } }).select("_id");
  const doctorIds = doctors.map((doctor) => doctor._id);
  const appointments = await Appointment.find({
    $or: [
      { doctorId: { $in: doctorIds } },
      { patientId: { $in: userIds } },
    ],
  }).select("_id");
  const appointmentIds = appointments.map((appointment) => appointment._id);

  await Promise.all([
    QueueEntry.deleteMany({
      $or: [
        { appointmentId: { $in: appointmentIds } },
        { patientId: { $in: userIds } },
      ],
    }),
    QueueSession.deleteMany({ doctorId: { $in: doctorIds } }),
    Consultation.deleteMany({
      $or: [
        { appointmentId: { $in: appointmentIds } },
        { patientId: { $in: userIds } },
        { doctorId: { $in: doctorIds } },
      ],
    }),
    CarePlan.deleteMany({
      $or: [{ patientId: { $in: userIds } }, { doctorId: { $in: doctorIds } }],
    }),
    Notification.deleteMany({ userId: { $in: userIds } }),
    Appointment.deleteMany({
      $or: [
        { doctorId: { $in: doctorIds } },
        { patientId: { $in: userIds } },
      ],
    }),
    MedicalRecord.deleteMany({
      patientId: { $in: userIds },
      title: /^(Demo health history|Demo visit record|Visit record)/i,
    }),
    DoctorSchedule.deleteMany({ doctorId: { $in: doctorIds } }),
    Doctor.deleteMany({ userId: { $in: userIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);
}

async function seedDemoData(): Promise<void> {
  if (process.env.ALLOW_DEMO_DATA_SEEDING !== "true") {
    throw new Error("Set ALLOW_DEMO_DATA_SEEDING=true to seed demo data");
  }
  if (process.env.CAREFLOW_DEMO_MODE !== "true") {
    throw new Error("Run demo seeding through `npm run seed:demo-data`");
  }

  const password = process.env.DEMO_SEED_PASSWORD;
  if (!password || password.length < 8 || password.length > 128) {
    throw new Error(
      "Set DEMO_SEED_PASSWORD to a password between 8 and 128 characters",
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");

  const expectedDatabaseName = assertLocalDemoDatabaseUri(uri);
  await mongoose.connect(uri, { directConnection: true });
  const databaseName = mongoose.connection.name;
  if (databaseName !== expectedDatabaseName) {
    throw new Error(
      `Connected to unexpected database "${databaseName}"; refusing to seed`,
    );
  }

  await clearExistingDemoFixtures();

  const passwordHash = await bcrypt.hash(password, 12);
  const demoStaffAccounts = [
    {
      role: "receptionist" as const,
      name: "Front Desk Staff",
      email: `demo.reception@${DEMO_EMAIL_DOMAIN}`,
    },
    {
      role: "admin" as const,
      name: "Hospital Director",
      email: `demo.admin@${DEMO_EMAIL_DOMAIN}`,
    },
  ];
  const staffUsers = await Promise.all(
    demoStaffAccounts.map((account) =>
      ensureDemoStaffAccount(
        account.email,
        account.name,
        account.role,
        passwordHash,
        password,
      ),
    ),
  );
  const todayKey = clinicDateKey();
  const today = parseDateOnly(todayKey);
  if (!today) throw new Error("Unable to determine the clinic date");

  const createdDoctors: Array<{ user: mongoose.Types.ObjectId; doctor: mongoose.Types.ObjectId; email: string }> = [];
  for (let index = 0; index < doctorSeeds.length; index += 1) {
    const [name, specialization, qualification, experienceYears] = doctorSeeds[index];
    const email = `demo.doctor.${String(index + 1).padStart(2, "0")}@${DEMO_EMAIL_DOMAIN}`;
    const user = await getOrCreateDemoUser(
      email,
      name,
      "doctor",
      passwordHash,
      password,
    );
    let doctor = await Doctor.findOne({ userId: user._id });
    if (!doctor) {
      doctor = await Doctor.create({
        userId: user._id,
        specialization,
        qualification,
        experienceYears,
        licenseNumber: `DEMO-CF-${String(index + 1).padStart(4, "0")}`,
        consultationFee: 500 + index * 150,
        bio: `Demo profile for testing ${specialization.toLowerCase()} care workflows.`,
        isAvailable: true,
      });
    } else if (
      doctor.specialization !== specialization ||
      doctor.qualification !== qualification ||
      !doctor.isAvailable
    ) {
      throw new Error(
        `Existing demo doctor profile for ${email} differs from the fixture; refusing to modify it`,
      );
    }

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
      const existingSchedule = await DoctorSchedule.findOne({
        doctorId: doctor._id,
        dayOfWeek,
      });
      if (
        existingSchedule &&
        (existingSchedule.startTime !== "09:00" ||
          existingSchedule.endTime !== "13:00" ||
          existingSchedule.slotDuration !== 30 ||
          !existingSchedule.isAvailable)
      ) {
        throw new Error(
          `Existing schedule for ${email} differs from the fixture; refusing to modify it`,
        );
      }
      if (!existingSchedule) {
        await DoctorSchedule.create({
          doctorId: doctor._id,
          dayOfWeek,
          startTime: "09:00",
          endTime: "13:00",
          slotDuration: 30,
          isAvailable: true,
        });
      }
    }
    createdDoctors.push({
      user: user._id,
      doctor: doctor._id,
      email,
    });
  }

  const patients = [];
  for (let index = 0; index < patientNames.length; index += 1) {
    const name = patientNames[index];
    const email = `demo.patient.${String(index + 1).padStart(2, "0")}@${DEMO_EMAIL_DOMAIN}`;
    const user = await getOrCreateDemoUser(
      email,
      name,
      "patient",
      passwordHash,
      password,
      {
        phone: `DEMO-PHONE-${String(index + 1).padStart(4, "0")}`,
        dateOfBirth: new Date(Date.UTC(1980 + (index % 20), index % 12, 1)),
        gender: index % 2 === 0 ? "Female" : "Male",
        bloodGroup: bloodGroups[index % bloodGroups.length],
        address: `Demo Address ${String(index + 1).padStart(2, "0")}, CareFlow City`,
      },
    );
    patients.push({ user, email, name });
  }

  const results = {
    database: databaseName,
    accounts: [] as Array<Record<string, string>>,
    appointments: [] as Array<Record<string, string>>,
    consultations: [] as Array<Record<string, string>>,
    medicalRecords: [] as Array<Record<string, string>>,
    queueEntries: [] as Array<Record<string, string>>,
    carePlans: [] as Array<Record<string, string>>,
  };

  demoStaffAccounts.forEach((account, index) => {
    results.accounts.push({
      role: account.role,
      name: account.name,
      email: account.email,
      userId: staffUsers[index]._id.toString(),
    });
  });

  for (let doctorIndex = 0; doctorIndex < createdDoctors.length; doctorIndex += 1) {
    const seededDoctor = createdDoctors[doctorIndex];
    const doctor = await Doctor.findById(seededDoctor.doctor);
    if (!doctor) throw new Error(`Demo doctor profile missing for ${seededDoctor.email}`);

    results.accounts.push({
      role: "doctor",
      name: doctorSeeds[doctorIndex][0],
      email: seededDoctor.email,
      userId: seededDoctor.user.toString(),
      doctorId: doctor._id.toString(),
    });

    for (let patientIndex = 0; patientIndex < patients.length; patientIndex += 1) {
      const patient = patients[patientIndex];
      results.accounts.push({
        role: "patient",
        name: patient.name,
        email: patient.email,
        userId: patient.user._id.toString(),
      });
    }

    for (
      let appointmentIndex = 0;
      appointmentIndex < demoAppointmentPlans.length;
      appointmentIndex += 1
    ) {
      const plan = demoAppointmentPlans[appointmentIndex];
      const patient = patients[plan.patient];
      const appointmentDateValue = appointmentDate(addDays(today, plan.days));
      const [startHour, startMinute] = plan.time.split(":").map(Number);
      const endMinutes = startHour * 60 + startMinute + 30;
      const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
      const startTime = plan.time;
      const status = plan.status as
        | "completed"
        | "confirmed"
        | "scheduled"
        | "cancelled";
      let appointment = await Appointment.findOne({
        doctorId: doctor._id,
        appointmentDate: appointmentDateValue,
        startTime,
      });

      if (appointment) {
        if (appointment.patientId.toString() !== patient.user._id.toString()) {
          throw new Error(
            `Demo appointment slot conflict for ${seededDoctor.email} on ${appointmentDateValue.toISOString().slice(0, 10)} ${startTime}`,
          );
        }
      } else {
        appointment = await Appointment.create({
          patientId: patient.user._id,
          doctorId: doctor._id,
          appointmentDate: appointmentDateValue,
          startTime,
          endTime,
          reason: patientStories[plan.patient].reason,
          visitGoals: "Review my health history and discuss next steps.",
          symptoms: patientStories[plan.patient].reason,
          allergies: patientStories[plan.patient].allergies,
          medications: patientStories[plan.patient].medications,
          questions: "What should I monitor before my next visit?",
          status,
        });
      }

      results.appointments.push({
        appointmentId: appointment._id.toString(),
        patientId: patient.user._id.toString(),
        doctorId: doctor._id.toString(),
        date: appointmentDateValue.toISOString().slice(0, 10),
        startTime,
        status: appointment.status,
      });

      if (
        appointment.status === "confirmed" &&
        appointmentDateValue.getTime() === today.getTime()
      ) {
        let queue = await QueueSession.findOne({
          doctorId: doctor._id,
          date: today,
        });
        if (!queue) {
          queue = await QueueSession.create({
            doctorId: doctor._id,
            date: today,
            status: "open",
            currentNumber: 0,
            totalPatients: 0,
            nextQueueNumber: 0,
          });
        }

        let queueEntry = await QueueEntry.findOne({
          appointmentId: appointment._id,
        });
        if (!queueEntry) {
          const updatedQueue = await QueueSession.findOneAndUpdate(
            { _id: queue._id, status: "open" },
            [
              {
                $set: {
                  nextQueueNumber: {
                    $add: [
                      { $ifNull: ["$nextQueueNumber", "$totalPatients"] },
                      1,
                    ],
                  },
                },
              },
            ],
            { new: true, updatePipeline: true },
          );
          if (!updatedQueue) {
            throw new Error(`Demo queue for ${seededDoctor.email} is closed`);
          }
          queueEntry = await QueueEntry.create({
            queueSessionId: queue._id,
            appointmentId: appointment._id,
            patientId: patient.user._id,
            queueNumber: updatedQueue.nextQueueNumber,
            status: appointmentIndex === 4 ? "called" : "waiting",
            checkedInAt: new Date(
              Date.now() - (12 + (appointmentIndex - 4) * 7) * 60_000,
            ),
            ...(appointmentIndex === 4
              ? { calledAt: new Date(Date.now() - 4 * 60_000) }
              : {}),
          });
          await QueueSession.updateOne(
            { _id: queue._id },
            { $inc: { totalPatients: 1 } },
          );
          if (appointmentIndex === 4) {
            await QueueSession.updateOne(
              { _id: queue._id },
              { $set: { currentNumber: queueEntry.queueNumber } },
            );
          }
        }
        results.queueEntries.push({
          entryId: queueEntry._id.toString(),
          appointmentId: appointment._id.toString(),
          patientId: patient.user._id.toString(),
          queueNumber: String(queueEntry.queueNumber),
          status: queueEntry.status,
        });
      }

      if (appointment.status === "completed") {
        const story = patientStories[plan.patient];
        const consultation = await Consultation.create({
          appointmentId: appointment._id,
          patientId: patient.user._id,
          doctorId: doctor._id,
          symptoms: story.reason,
          diagnosis: "Assessment deferred; follow-up with the treating clinician.",
          prescription: "No prescription recorded.",
          notes: `${story.history} ${story.vitals}`,
          followUpDate: appointmentDate(addDays(today, 14)),
        });
        results.consultations.push({
          consultationId: consultation._id.toString(),
          appointmentId: appointment._id.toString(),
          patientId: patient.user._id.toString(),
        });
      }
    }

    for (let patientIndex = 0; patientIndex < patients.length; patientIndex += 1) {
      const patient = patients[patientIndex];
      const story = patientStories[patientIndex];
      for (let recordIndex = 0; recordIndex < 4; recordIndex += 1) {
        const recordTitle = `Visit record ${String(recordIndex + 1).padStart(2, "0")}`;
        const recordedAt = appointmentDate(
          addDays(today, [-35, -21, -7, 0][recordIndex]),
        );
        const record = await MedicalRecord.create({
          patientId: patient.user._id,
          doctorId: createdDoctors[0].doctor,
          title: recordTitle,
          description: [
            `Visit reason: ${story.reason}`,
            `Relevant history: ${story.history}`,
            `Allergies: ${story.allergies}`,
            `Current medications: ${story.medications}`,
            `Observations: ${story.vitals}`,
            `Visit status: ${recordIndex === 3 ? "follow-up review" : "historical review"}.`,
            "Plan: Discuss questions and next steps with a licensed clinician.",
          ].join("\n"),
          recordedAt,
        });
        results.medicalRecords.push({
          recordId: record._id.toString(),
          patientId: patient.user._id.toString(),
          title: record.title,
        });
      }
      const carePlan = await CarePlan.create({
        patientId: patient.user._id,
        doctorId: createdDoctors[0].doctor,
        title: "Care coordination checklist",
        notes: "Review progress at the next appointment and contact the clinic with questions.",
        tasks: [
          {
            title: "Review the visit summary",
            dueDate: appointmentDate(addDays(today, 3)),
            status: "pending",
          },
          {
            title: "Prepare questions for the next appointment",
            dueDate: appointmentDate(addDays(today, 10)),
            status: "pending",
          },
        ],
        medications: [
          {
            name: "Medication review",
            dosage: "As prescribed by treating clinician",
            schedule: "Follow the dispensing label",
            instructions: "Confirm medication details with the treating clinician.",
            startDate: today,
            endDate: appointmentDate(addDays(today, 7)),
            takenDates: [],
          },
        ],
      });
      results.carePlans.push({
        carePlanId: carePlan._id.toString(),
        patientId: patient.user._id.toString(),
        title: carePlan.title,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ...results,
        loginPassword: "Use the local DEMO_SEED_PASSWORD configured in backend/server/.env.demo.",
        note: "Training environment data is illustrative; assistant guidance is keyword-based and is not a clinical assessment.",
      },
      null,
      2,
    ),
  );
}

seedDemoData()
  .catch((error: unknown) => {
    console.error(
      "Demo data seeding failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
