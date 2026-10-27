# CareFlow — Architecture

CareFlow is a smart healthcare management platform connecting patients, doctors and
administrators around a single appointment and medical-record workflow.

This document describes (1) the intended MERN reference architecture from the project
brief, and (2) how that architecture is realised in this running implementation.

---

## 1. Reference architecture (MERN brief)

```text
React.js  →  Node.js + Express.js  →  MongoDB (Atlas)
                      │
                      └──→ Python + FastAPI  →  AI/ML model
                      └──→ Redis (cache, queues, rate limiting)
```

### Intended backend layout

```text
server/
├── src/
│   ├── config/        database.js, environment.js
│   ├── controllers/   auth, doctor, patient, appointment, notification, medicalHistory
│   ├── models/        User, Doctor, Patient, Appointment, MedicalHistory, Notification
│   ├── routes/        authRoutes, doctorRoutes, patientRoutes, appointmentRoutes, ...
│   ├── middleware/    auth, role, error, validation
│   ├── services/      authService, appointmentService, notificationService, aiService
│   ├── utils/         logger.js
│   └── server.js
├── package.json
└── .env
```

### Intended REST surface

```text
POST   /api/auth/register
POST   /api/auth/login

GET    /api/doctors
GET    /api/doctors/:id

POST   /api/appointments
GET    /api/appointments/patient
GET    /api/appointments/doctor

PATCH  /api/appointments/:id/accept
PATCH  /api/appointments/:id/reject
PATCH  /api/appointments/:id/cancel
```

### Intended containerisation

`docker-compose.yml` services: `frontend`, `backend`, `mongodb`, `redis`, `ai-service`,
started with `docker compose up --build`.

---

## 2. Current implementation

The repository contains a React + TanStack Start frontend, a standalone Express +
MongoDB backend under `../../backend/server`, and a preserved FastAPI implementation
under `../../old-backend`. The frontend's JWT authentication,
doctor directory/profile, appointment workflow, notifications, doctor patient list,
medical records, patient profile, appointment insights, and the symptom assistant use
the MERN API. The frontend no longer uses Supabase for authentication or data access.

| Brief                                            | As built                                                | Notes                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| React + TypeScript + Vite + Tailwind + shadcn/ui | Same                                                    | React 19, TanStack Router                                                                              |
| React Router                                     | TanStack Router                                         | File-based routing in `src/routes`                                                                     |
| Express REST controllers                         | Express + TypeScript controllers and routes             | `backend/server/src`                                                                                   |
| JWT auth + bcrypt                                | MERN JWT middleware and bcrypt-hashed passwords         | Patient/doctor public registration; admin cannot self-register                                         |
| Role middleware                                  | JWT-verified user roles                                 | patient / doctor / admin / receptionist                                                                |
| MongoDB collections                              | MongoDB + Mongoose models                               | Users, doctors, schedules, appointments, queues, consultations, medical records, notifications         |
| Mongoose validation & indexes                    | Mongoose schemas and indexes                            | Additional request validation is applied in controllers                                                |
| Authentication and account bootstrap             | MERN JWT API                                            | Registration stores the account in MongoDB; authenticated routes refresh it through `GET /api/auth/me` |
| AI decision support                              | MERN-authenticated assistant route calls the AI gateway | Decision-support only                                                                                  |
| Redis cache                                      | TanStack Query client cache + edge caching              |                                                                                                        |
| Docker Compose                                   | Managed deploy pipeline                                 |                                                                                                        |

### MERN doctor directory and profile

The authenticated doctor directory uses `GET /api/doctors` with search, specialty,
availability, and sorting filters. `GET /api/doctors/:id` returns a public doctor
profile. Both endpoints omit license numbers and private user contact details.
Doctors edit their account name through `PATCH /api/auth/me` and create or edit their
own professional profile through `GET`, `POST`, and `PATCH /api/doctors/profile`.
The license number is only requested during profile creation. Patients can retrieve
date-specific slots through `GET /api/doctors/:id/slots` and request bookings through
the MERN appointment API. Doctors manage weekly availability from their profile.
Patients manage their name, phone, date of birth, gender, blood group, and address
through the authenticated `GET` and `PATCH /api/auth/me` endpoints.
Authenticated users can change their password through `PATCH /api/auth/password`.
The endpoint verifies the current password, rotates the JWT version to revoke other
sessions, and returns a replacement token for the active session.
Socket.IO connections also require a valid JWT. User rooms are assigned from the
verified identity, and queue rooms are limited to the owning doctor; patient queue
updates are delivered through the patient's private user room.
The frontend authenticates its Socket.IO connection with the current JWT, joins the
doctor's authorized queue room, and refreshes queue, appointment, and notification
queries when events arrive. Existing periodic refreshes remain as a fallback when the
live connection is unavailable.
Date boundaries used for appointment check-in and upcoming visits follow the clinic
time zone (`CAREFLOW_TIME_ZONE` on the backend and matching `VITE_CAREFLOW_TIME_ZONE`
on the frontend); both default to `Asia/Kolkata`.
Appointments can only be marked complete by saving their consultation. Saving a
consultation completes its appointment and any active queue entry; doctors cannot
complete a queue entry independently of its clinical summary.
Patients may cancel a checked-in appointment while it is still waiting, which removes
it from the active queue. A checked-in appointment cannot be rescheduled; patients must
cancel it and request a new slot. Once the doctor calls the patient, cancellation and
rescheduling are blocked until the consultation is recorded.

Appointment insights are served by the role-scoped `GET /api/insights` endpoint.
Patients and doctors see analytics for their own appointments; admins see platform-wide
appointment analytics and registered patient/doctor counts.

Patients can check in to confirmed appointments on the clinic date and see their queue
number and status from the appointments page. Doctors manage their live queue from the
dashboard; queue status refreshes periodically, and only the owning doctor can call
patients. A waiting patient can cancel their appointment and leave the queue; a called
patient cannot cancel or reschedule.

Doctors can record a consultation after a confirmed appointment starts. Consultation
summaries are visible to the patient and treating doctor in the records page, and the
completed visit is reflected in appointment status and notifications.

Patients can add optional visit goals, symptoms, allergies, current medications, and
questions when requesting an appointment. The patient and treating doctor can review
this visit-preparation brief from the appointment list and doctor dashboard.

The records page includes shared care plans. A treating doctor can assign follow-up
tasks and medication instructions to a patient with an existing appointment
relationship. Patients can mark tasks complete and log medication doses by clinic date;
doctors can review the shared progress. Due dates are displayed as in-app reminders
when the patient views the plan; this is not a scheduled push-notification service and
does not prescribe or change medication.

Live queue responses include an approximate wait estimate based on the number of active
queue entries ahead and the doctor's configured appointment-slot duration. The estimate
is shown with queue position and elapsed wait time and is recalculated as the queue
changes. It is an estimate, not a guaranteed service time.

The symptom assistant posts conversations to `POST /api/assistant`, which requires a
patient JWT. With `LOVABLE_API_KEY`, it sends the prompt to the configured AI gateway.
In local demo mode without that key, a keyword-based response provides specialty,
urgency, and self-care examples; it is explicitly labeled as rule-based and is not a
clinical assessment. Conversation content is not persisted by the API.

### Development demo data

Demo data uses a separate local-only backend environment and never uses the application's
`.env`. Start a local MongoDB service, copy `backend/server/.env.demo.example` to
`backend/server/.env.demo`, and set a local demo password and JWT secret. The demo runner
rejects remote, SRV, or multi-host MongoDB URIs and database names without `dev`,
`test`, `demo`, `sandbox`, or `local`, and forces a direct connection to the local
server; there is no live-database override. From `backend/server`, run
`npm run seed:demo-data` to create exactly seven demo accounts (one doctor, four
patients, one receptionist, and one administrator), weekly schedules, 16 appointments
in multiple states, 16 detailed fictional medical records, completed consultation
summaries, four shared care plans, and eight same-day queue entries with live
elapsed-wait timestamps. Re-seeding replaces the doctor and patient fixture accounts
and their linked demo appointments, queue entries, consultations, and demo-titled
records; it retains the receptionist and administrator accounts and synchronizes their
password to the configured demo password. All accounts share the password configured
as `DEMO_SEED_PASSWORD` in `.env.demo`.
Then run `npm run dev:demo` to serve the site against the local demo database. These
commands require `.env.demo` and never fall back to `.env`.
In frontend development mode, the sign-in page shows shortcuts for the doctor, a
patient, receptionist, and administrator accounts. Selecting one fills the email and
default demo password fields. The shortcuts are omitted from production builds.

Google sign-in is available when the same Google OAuth Web client ID is configured as
`GOOGLE_CLIENT_ID` in the backend environment and `VITE_GOOGLE_CLIENT_ID` in the
frontend environment. In Google Cloud Console, enable Google Identity Services, create
a Web application OAuth client, and add the local frontend origin (for example,
`http://localhost:8080`) to its authorized JavaScript origins. Add production frontend
origins before deploying. The frontend sends the Google ID token to
`POST /api/auth/google`; the backend verifies the token audience and verified email.
New Google accounts are created as patients. Existing matching email accounts are
linked to the verified Google identity, preserving their assigned CareFlow role.
Without the client ID, the Google button remains disabled and explains the missing
configuration.

The live queue monitor uses the queue entry's real backend `checkedInAt` timestamp and
updates the elapsed wait time in the browser every 15 seconds. It is shown for waiting
patients in the patient dashboard, appointment view, and doctor's live queue. When the
doctor calls a patient, the display stops at the backend `calledAt` timestamp.

### MERN appointment workflow

```text
SCHEDULED
   ├── doctor accepts  → CONFIRMED → consultation recorded → COMPLETED
   ├── doctor rejects  → REJECTED
   └── patient cancels → CANCELLED
```

Patients can reschedule active appointments to another free schedule slot. Booking
uses a partial unique MongoDB index to prevent concurrent active reservations and to
release cancelled, rejected, and completed slots.

The index replacement is a guarded, manual migration. Before deploying the appointment
schema change, stop appointment writes and run `npm run migrate:appointment-slot-index`
from `backend/server` with `ALLOW_APPOINTMENT_SLOT_INDEX_MIGRATION=true` and
`MONGODB_URI` configured. The script checks for duplicate active slots and exact index
definitions; it is not run automatically by the application.

### Authorization rules

- A person reads and edits only their own profile, patient record and notifications.
- Any signed-in person can browse doctor listings; a doctor edits only their own listing.
- A patient sees their own appointments and medical history.
- A doctor sees appointments booked with them, and the records of those patients.
- Admin role is granted directly in the backend; it can never be self-assigned.

### Frontend structure

```text
src/
├── routes/
│   ├── index.tsx                  public landing page
│   ├── auth.tsx                   sign in / register (patient or doctor)
│   └── _authenticated/
│       ├── route.tsx              session gate + app shell
│       ├── dashboard.tsx          role-aware dashboard
│       ├── doctors.tsx            search and filter
│       ├── doctor.$id.tsx         doctor details and appointment booking
│       └── appointments.tsx       full appointment workflow
├── components/                    AppShell, doctor schedule manager + UI primitives
├── lib/api.ts                     MERN HTTP API client (auth, doctors, schedules, appointments)
├── lib/specialties.ts             shared doctor specialty options
└── styles.css                     design system tokens
```

The doctor patient list is derived from the doctor's MERN appointment results and
shows appointment counts and the latest appointment. Medical records use the
authenticated `/api/medical-records` API: patients can read and add to their own
history, while doctors can read records for patients with an appointment relationship
and add entries only for their own patients. Patient demographic profile fields are
stored on the MERN user and available only through that user's authenticated profile.

### Safety statement

AI features in CareFlow present decision-support information only and do not replace
professional medical diagnosis.
