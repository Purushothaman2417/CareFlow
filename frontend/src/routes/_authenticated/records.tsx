import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, Pill } from "lucide-react";

import {
  ApiError,
  createCarePlan,
  getConsultations,
  createMedicalRecord,
  getAppointments,
  getCarePlans,
  getMedicalRecords,
  getSavedUser,
  toggleMedicationTaken,
  updateCarePlanTask,
  type Appointment,
  type CarePlan,
  type Consultation,
  type MedicalRecord,
} from "@/lib/api";
import { clinicDateKey } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/records")({
  head: () => ({
    meta: [
      { title: "Medical history — CareFlow" },
      {
        name: "description",
        content: "Diagnoses, prescriptions and visit notes kept securely in CareFlow.",
      },
      { property: "og:title", content: "Medical history — CareFlow" },
      {
        property: "og:description",
        content: "Your health timeline, shared only with your doctors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecordsPage,
});

function dateOnly(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function patientName(record: MedicalRecord) {
  return typeof record.patientId === "object" ? record.patientId.name : "Patient";
}

function doctorName(record: MedicalRecord) {
  if (!record.doctorId || typeof record.doctorId === "string") return null;
  return typeof record.doctorId.userId === "object" ? record.doctorId.userId.name : null;
}

function consultationDoctorName(consultation: Consultation) {
  if (typeof consultation.doctorId === "string") return "Doctor";
  return typeof consultation.doctorId.userId === "object"
    ? consultation.doctorId.userId.name
    : "Doctor";
}

function appointmentPatient(appointment: Appointment) {
  if (typeof appointment.patientId === "string") {
    return { id: appointment.patientId, name: "Patient" };
  }
  return { id: appointment.patientId._id, name: appointment.patientId.name };
}

function listPatients(appointments: Appointment[]) {
  const patients = new Map<string, string>();
  for (const appointment of appointments) {
    const patient = appointmentPatient(appointment);
    if (!patients.has(patient.id)) patients.set(patient.id, patient.name);
  }
  return [...patients.entries()].map(([id, name]) => ({ id, name }));
}

function RecordsPage() {
  const user = getSavedUser();
  const isDoctor = user?.role === "doctor";
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => clinicDateKey());
  const [patientId, setPatientId] = useState("");

  const recordsQuery = useQuery({
    queryKey: ["medical-records"],
    queryFn: getMedicalRecords,
    enabled: !!user,
  });
  const consultationsQuery = useQuery({
    queryKey: ["consultations"],
    queryFn: getConsultations,
    enabled: !!user,
  });
  const appointmentsQuery = useQuery({
    queryKey: ["appointments"],
    queryFn: getAppointments,
    enabled: isDoctor,
  });
  const patients = listPatients(appointmentsQuery.data ?? []);
  const createMutation = useMutation({
    mutationFn: createMedicalRecord,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["medical-records"] });
      setTitle("");
      setDescription("");
      toast.success("Record added.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not add this medical record."),
  });
  const records = recordsQuery.data ?? [];

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({
      ...(isDoctor ? { patientId } : {}),
      title: title.trim(),
      description: description.trim(),
      recordedAt,
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <h1 className="font-display text-3xl font-semibold">
          {isDoctor ? "Patient records" : "My medical history"}
        </h1>

        {recordsQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : recordsQuery.isError ? (
          <div className="surface-card space-y-3 p-8 text-center">
            <p className="text-sm text-destructive" role="alert">
              Medical records could not be loaded.
            </p>
            <Button variant="outline" onClick={() => void recordsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : records.length === 0 ? (
          <div className="surface-card flex flex-col items-center gap-2 p-10 text-muted-foreground">
            <FileText className="size-8" /> No records yet.
          </div>
        ) : (
          <ol className="space-y-3 border-l-2 border-border pl-5">
            {records.map((record) => (
              <li key={record._id} className="surface-card relative p-4">
                <span className="absolute -left-[27px] top-5 size-3 rounded-full bg-primary" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{record.title}</p>
                  <time className="text-xs text-muted-foreground" dateTime={record.recordedAt}>
                    {dateOnly(record.recordedAt)}
                  </time>
                </div>
                {record.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{record.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {isDoctor
                    ? `Patient: ${patientName(record)}`
                    : doctorName(record)
                      ? `By Dr. ${doctorName(record)}`
                      : "Self-reported"}
                </p>
              </li>
            ))}
          </ol>
        )}

        <section className="space-y-3 pt-5">
          <h2 className="text-xl font-semibold">Consultation summaries</h2>
          {consultationsQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : consultationsQuery.isError ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
              <p className="text-sm text-destructive" role="alert">
                Consultation summaries could not be loaded.
              </p>
              <Button variant="outline" size="sm" onClick={() => void consultationsQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : consultationsQuery.data?.length ? (
            consultationsQuery.data.map((consultation: Consultation) => (
              <article key={consultation._id} className="surface-card space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium">{consultation.diagnosis || "Consultation"}</h3>
                  <time className="text-xs text-muted-foreground" dateTime={consultation.createdAt}>
                    {dateOnly(consultation.createdAt)}
                  </time>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDoctor
                    ? `Patient: ${
                        typeof consultation.patientId === "string"
                          ? "Patient"
                          : consultation.patientId.name
                      }`
                    : `By Dr. ${consultationDoctorName(consultation)}`}
                </p>
                {consultation.symptoms ? (
                  <p className="text-sm">
                    <span className="font-medium">Symptoms:</span> {consultation.symptoms}
                  </p>
                ) : null}
                {consultation.prescription ? (
                  <p className="whitespace-pre-wrap text-sm">
                    <span className="font-medium">Plan:</span> {consultation.prescription}
                  </p>
                ) : null}
                {consultation.notes ? (
                  <p className="whitespace-pre-wrap text-sm">{consultation.notes}</p>
                ) : null}
                {consultation.followUpDate ? (
                  <p className="text-xs text-muted-foreground">
                    Follow-up: {dateOnly(consultation.followUpDate)}
                  </p>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No consultation summaries yet.</p>
          )}
        </section>

        <CarePlanSection isDoctor={isDoctor} patients={patients} />
      </section>

      <form className="surface-card h-fit space-y-4 p-5" onSubmit={add}>
        <h2 className="font-display text-lg font-semibold">Add entry</h2>
        {isDoctor ? (
          <div className="space-y-1.5">
            <Label htmlFor="record-patient">Patient</Label>
            {appointmentsQuery.isError ? (
              <p className="text-sm text-destructive" role="alert">
                Patients could not be loaded.
              </p>
            ) : (
              <select
                id="record-patient"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                disabled={appointmentsQuery.isLoading}
                required
              >
                <option value="">{appointmentsQuery.isLoading ? "Loading…" : "Select…"}</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="record-title">Title</Label>
          <Input
            id="record-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Diagnosis: migraine"
            maxLength={200}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="record-date">Date</Label>
          <Input
            id="record-date"
            type="date"
            value={recordedAt}
            onChange={(event) => setRecordedAt(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="record-details">Details</Label>
          <Textarea
            id="record-details"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Prescription, allergies, notes…"
          />
        </div>
        <Button
          className="w-full"
          type="submit"
          disabled={
            createMutation.isPending ||
            !title.trim() ||
            (isDoctor && (!patientId || appointmentsQuery.isLoading || appointmentsQuery.isError))
          }
        >
          {createMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}

function CarePlanSection({
  isDoctor,
  patients,
}: {
  isDoctor: boolean;
  patients: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [patientId, setPatientId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [medicationName, setMedicationName] = useState("");
  const [medicationDosage, setMedicationDosage] = useState("");
  const [medicationSchedule, setMedicationSchedule] = useState("");
  const [medicationInstructions, setMedicationInstructions] = useState("");
  const [medicationStartDate, setMedicationStartDate] = useState(() => clinicDateKey());
  const [medicationEndDate, setMedicationEndDate] = useState("");
  const plansQuery = useQuery({
    queryKey: ["care-plans"],
    queryFn: getCarePlans,
  });
  const createMutation = useMutation({
    mutationFn: createCarePlan,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["care-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      setTitle("");
      setNotes("");
      setTaskTitle("");
      setTaskDueDate("");
      setMedicationName("");
      setMedicationDosage("");
      setMedicationSchedule("");
      setMedicationInstructions("");
      setMedicationStartDate(clinicDateKey());
      setMedicationEndDate("");
      toast.success("Care plan shared with the patient.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not save the care plan."),
  });
  const taskMutation = useMutation({
    mutationFn: ({
      planId,
      taskId,
      status,
    }: {
      planId: string;
      taskId: string;
      status: "pending" | "completed";
    }) => updateCarePlanTask(planId, taskId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["care-plans"] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not update the care task."),
  });
  const medicationMutation = useMutation({
    mutationFn: ({ planId, medicationId }: { planId: string; medicationId: string }) =>
      toggleMedicationTaken(planId, medicationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["care-plans"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Could not update medication tracking.",
      ),
  });
  const today = clinicDateKey();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tasks = taskTitle.trim()
      ? [{ title: taskTitle.trim(), ...(taskDueDate ? { dueDate: taskDueDate } : {}) }]
      : [];
    const medications = medicationName.trim()
      ? [
          {
            name: medicationName.trim(),
            dosage: medicationDosage.trim(),
            schedule: medicationSchedule.trim(),
            instructions: medicationInstructions.trim(),
            startDate: medicationStartDate,
            ...(medicationEndDate ? { endDate: medicationEndDate } : {}),
          },
        ]
      : [];
    createMutation.mutate({
      patientId,
      title: title.trim(),
      notes: notes.trim(),
      tasks,
      medications,
    });
  }

  return (
    <section className="space-y-4 pt-5">
      <div>
        <h2 className="text-xl font-semibold">Shared care plans</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Follow-up tasks and medication tracking shared between patient and doctor.
        </p>
      </div>

      {plansQuery.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : plansQuery.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4">
          <p className="text-sm text-destructive" role="alert">
            Care plans could not be loaded.
          </p>
          <Button variant="outline" size="sm" onClick={() => void plansQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : plansQuery.data?.length ? (
        <div className="space-y-3">
          {plansQuery.data.map((plan) => (
            <CarePlanCard
              key={plan._id}
              plan={plan}
              isDoctor={isDoctor}
              today={today}
              onTaskStatus={(taskId, status) =>
                taskMutation.mutate({ planId: plan._id, taskId, status })
              }
              onMedicationTaken={(medicationId) =>
                medicationMutation.mutate({ planId: plan._id, medicationId })
              }
              isUpdating={taskMutation.isPending || medicationMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <p className="surface-card p-5 text-sm text-muted-foreground">No shared care plans yet.</p>
      )}

      {isDoctor ? (
        <form className="surface-card space-y-3 p-5" onSubmit={submit}>
          <h3 className="font-semibold">Create a patient care plan</h3>
          <div className="space-y-1.5">
            <Label htmlFor="care-plan-patient">Patient</Label>
            <select
              id="care-plan-patient"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              required
            >
              <option value="">Select a patient</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="care-plan-title">Plan title</Label>
            <Input
              id="care-plan-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="care-plan-notes">Notes for the patient</Label>
            <Textarea
              id="care-plan-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="care-plan-task">Follow-up task (optional)</Label>
              <Input
                id="care-plan-task"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                maxLength={200}
                placeholder="e.g. Schedule a follow-up visit"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-plan-task-date">Task due date</Label>
              <Input
                id="care-plan-task-date"
                type="date"
                value={taskDueDate}
                onChange={(event) => setTaskDueDate(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="care-medication-name">Medication name (optional)</Label>
              <Input
                id="care-medication-name"
                value={medicationName}
                onChange={(event) => setMedicationName(event.target.value)}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-medication-dose">Dose / strength</Label>
              <Input
                id="care-medication-dose"
                value={medicationDosage}
                onChange={(event) => setMedicationDosage(event.target.value)}
                maxLength={100}
                required={!!medicationName.trim()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-medication-schedule">Schedule</Label>
              <Input
                id="care-medication-schedule"
                value={medicationSchedule}
                onChange={(event) => setMedicationSchedule(event.target.value)}
                maxLength={200}
                placeholder="As prescribed by your clinician"
                required={!!medicationName.trim()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-medication-start">Start date</Label>
              <Input
                id="care-medication-start"
                type="date"
                value={medicationStartDate}
                onChange={(event) => setMedicationStartDate(event.target.value)}
                required={!!medicationName.trim()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-medication-end">End date (optional)</Label>
              <Input
                id="care-medication-end"
                type="date"
                value={medicationEndDate}
                onChange={(event) => setMedicationEndDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-medication-instructions">Instructions</Label>
              <Input
                id="care-medication-instructions"
                value={medicationInstructions}
                onChange={(event) => setMedicationInstructions(event.target.value)}
                maxLength={1000}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter only clinician-approved instructions. This tracker does not prescribe or adjust
            medication.
          </p>
          <Button
            type="submit"
            disabled={
              createMutation.isPending ||
              !patientId ||
              !title.trim() ||
              (!taskTitle.trim() && !medicationName.trim())
            }
          >
            {createMutation.isPending ? "Saving…" : "Share care plan"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function CarePlanCard({
  plan,
  isDoctor,
  today,
  onTaskStatus,
  onMedicationTaken,
  isUpdating,
}: {
  plan: CarePlan;
  isDoctor: boolean;
  today: string;
  onTaskStatus: (taskId: string, status: "pending" | "completed") => void;
  onMedicationTaken: (medicationId: string) => void;
  isUpdating: boolean;
}) {
  const patient = typeof plan.patientId === "string" ? "Patient" : plan.patientId.name;
  const doctor =
    typeof plan.doctorId === "string" || typeof plan.doctorId.userId === "string"
      ? "Doctor"
      : plan.doctorId.userId.name;

  return (
    <article className="surface-card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{plan.title}</h3>
          <p className="text-xs text-muted-foreground">
            {isDoctor ? `For ${patient}` : `From ${doctor}`} · Created {dateOnly(plan.createdAt)}
          </p>
        </div>
        {plan.notes ? <p className="max-w-xl text-sm">{plan.notes}</p> : null}
      </div>
      {plan.tasks.map((task) => {
        const overdue =
          task.status === "pending" && task.dueDate && task.dueDate.slice(0, 10) < today;
        const dueToday = task.dueDate?.slice(0, 10) === today;
        return (
          <div
            key={task._id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 text-primary" />
              <div>
                <p className={task.status === "completed" ? "text-sm line-through" : "text-sm"}>
                  {task.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {task.dueDate ? `Due ${dateOnly(task.dueDate)} · ` : ""}
                  {overdue ? "Overdue" : dueToday ? "Due today" : task.status}
                </p>
              </div>
            </div>
            {!isDoctor ? (
              <Button
                size="sm"
                variant={task.status === "completed" ? "outline" : "default"}
                disabled={isUpdating}
                onClick={() =>
                  onTaskStatus(task._id, task.status === "completed" ? "pending" : "completed")
                }
              >
                {task.status === "completed" ? "Reopen" : "Mark complete"}
              </Button>
            ) : (
              <span className="text-xs capitalize text-muted-foreground">{task.status}</span>
            )}
          </div>
        );
      })}
      {plan.medications.map((medication) => {
        const active =
          medication.startDate.slice(0, 10) <= today &&
          (!medication.endDate || medication.endDate.slice(0, 10) >= today);
        const takenToday = medication.takenDates.includes(today);
        return (
          <div
            key={medication._id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
          >
            <div className="flex items-start gap-2">
              <Pill className="mt-0.5 size-4 text-primary" />
              <div>
                <p className="text-sm font-medium">
                  {medication.name} · {medication.dosage}
                </p>
                <p className="text-xs text-muted-foreground">
                  {medication.schedule} ·{" "}
                  {medication.instructions || "Follow clinician instructions"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {active
                    ? takenToday
                      ? "Logged today"
                      : "Reminder: log today’s dose"
                    : "Outside date range"}
                  {isDoctor ? ` · ${medication.takenDates.length} dose-days logged` : ""}
                </p>
              </div>
            </div>
            {!isDoctor && active ? (
              <Button
                size="sm"
                variant={takenToday ? "outline" : "default"}
                disabled={isUpdating}
                onClick={() => onMedicationTaken(medication._id)}
              >
                {takenToday ? "Undo today" : "Mark taken"}
              </Button>
            ) : null}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Tracking supports follow-through and does not replace advice from your healthcare
        professional.
      </p>
    </article>
  );
}
