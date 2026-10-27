import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  History,
  LayoutGrid,
  List,
  RotateCcw,
  XCircle,
} from "lucide-react";

import {
  ApiError,
  cancelAppointment,
  checkInToQueue,
  createConsultation,
  getAppointments,
  getDoctorSlots,
  getMyQueueEntries,
  getSavedUser,
  rescheduleAppointment,
  updateAppointmentStatus,
  type Appointment,
  type QueueEntry,
} from "@/lib/api";
import { clinicDateKey } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { QueueWaitTime } from "@/components/QueueWaitTime";
import { QueueWaitEstimate } from "@/components/QueueWaitEstimate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — CareFlow" },
      {
        name: "description",
        content:
          "Track every CareFlow appointment: scheduled requests, confirmed visits, cancellations and completed consultations.",
      },
      { property: "og:title", content: "Appointments — CareFlow" },
      { property: "og:description", content: "Track requests, confirmed visits and history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppointmentsPage,
});

const FILTERS = ["all", "scheduled", "confirmed", "rejected", "cancelled", "completed"] as const;
type Filter = (typeof FILTERS)[number];

function appointmentDateKey(value: string) {
  return value.slice(0, 10);
}

function selectedDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function statusTone(status: Appointment["status"]) {
  if (status === "confirmed") return "bg-success/12 text-success border-success/25";
  if (status === "scheduled") return "bg-warning/15 text-warning-foreground border-warning/40";
  if (status === "rejected" || status === "cancelled") {
    return "bg-destructive/10 text-destructive border-destructive/25";
  }
  return "bg-muted text-muted-foreground border-border";
}

function displayDate(appointment: Appointment) {
  const date = appointmentDateKey(appointment.appointmentDate);
  return `${date} · ${appointment.startTime}–${appointment.endTime}`;
}

function patientName(appointment: Appointment) {
  return typeof appointment.patientId === "object" ? appointment.patientId.name : "Patient";
}

function doctorDetails(appointment: Appointment) {
  if (typeof appointment.doctorId === "string") return { name: "Doctor", specialization: "" };
  const name =
    typeof appointment.doctorId.userId === "object" ? appointment.doctorId.userId.name : "Doctor";
  return { name, specialization: appointment.doctorId.specialization };
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

function AppointmentsPage() {
  const user = getSavedUser();
  const isDoctor = user?.role === "doctor";
  const isPatient = user?.role === "patient";
  const isStaff = user?.role === "receptionist" || user?.role === "admin";

  const [filter, setFilter] = useState<Filter>("all");
  const [day, setDay] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  const query = useQuery({
    queryKey: ["appointments"],
    queryFn: getAppointments,
    enabled: !!user,
  });

  const queueQuery = useQuery({
    queryKey: ["my-queue"],
    queryFn: getMyQueueEntries,
    enabled: isPatient,
    refetchInterval: 15_000,
  });

  const rows = query.data ?? [];
  const bookedDays = rows
    .filter((row) => row.status === "scheduled" || row.status === "confirmed")
    .map((row) => new Date(`${appointmentDateKey(row.appointmentDate)}T12:00:00`));

  const list = rows
    .filter((row) => filter === "all" || row.status === filter)
    .filter((row) => !day || appointmentDateKey(row.appointmentDate) === selectedDateKey(day))
    .sort((first, second) =>
      `${first.appointmentDate}${first.startTime}`.localeCompare(
        `${second.appointmentDate}${second.startTime}`,
      ),
    );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Appointments</h1>
          <p className="mt-1 text-muted-foreground">
            {isDoctor
              ? "Clinical schedule and consultation requests."
              : isStaff
                ? "Hospital-wide patient appointments and booking calendar."
                : "Every consultation and specialist visit you've requested."}
          </p>
        </div>

        {/* VIEW TOGGLE */}
        <div className="flex items-center rounded-lg border border-border bg-secondary/40 p-1">
          <Button
            size="sm"
            variant={viewMode === "list" ? "default" : "ghost"}
            className="h-7 gap-1.5 text-xs"
            onClick={() => setViewMode("list")}
          >
            <List className="size-3.5" />
            List View
          </Button>
          <Button
            size="sm"
            variant={viewMode === "calendar" ? "default" : "ghost"}
            className="h-7 gap-1.5 text-xs"
            onClick={() => setViewMode("calendar")}
          >
            <CalendarDays className="size-3.5" />
            Schedule Grid
          </Button>
        </div>
      </header>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList className="flex-wrap">
          {FILTERS.map((item) => (
            <TabsTrigger key={item} value={item} className="capitalize">
              {item === "scheduled" ? "requested" : item}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {viewMode === "list" ? (
        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <div className="surface-card h-fit p-3">
            <Calendar
              mode="single"
              selected={day}
              onSelect={setDay}
              modifiers={{ booked: bookedDays }}
              modifiersClassNames={{
                booked: "font-bold text-primary underline underline-offset-4",
              }}
            />
            {day ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2"
                onClick={() => setDay(undefined)}
              >
                Show all dates
              </Button>
            ) : (
              <p className="px-2 pt-2 text-xs text-muted-foreground">
                Underlined days have upcoming visits.
              </p>
            )}
          </div>

          <div className="space-y-3">
            {isPatient && queueQuery.isError ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3 text-sm">
                <p className="text-destructive" role="alert">
                  Queue status could not be loaded.
                </p>
                <Button variant="outline" size="sm" onClick={() => void queueQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}

            {query.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : query.isError ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <p className="text-sm text-destructive" role="alert">
                  Appointments could not be loaded.
                </p>
                <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>
                  Try again
                </Button>
              </div>
            ) : list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No appointments match current filters.
              </div>
            ) : (
              list.map((appointment) => (
                <AppointmentCard
                  key={appointment._id}
                  appointment={appointment}
                  isDoctor={isDoctor}
                  isPatient={isPatient}
                  isStaff={isStaff}
                  queueEntry={queueQuery.data?.find(
                    (entry) =>
                      typeof entry.appointmentId !== "string" &&
                      entry.appointmentId._id === appointment._id,
                  )}
                  queueLoading={queueQuery.isLoading || queueQuery.isError}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        /* CALENDAR SCHEDULE GRID VIEW */
        <div className="surface-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Appointment Schedule Grid</h2>
            <span className="text-xs text-muted-foreground">Sorted by date and slot time</span>
          </div>

          {list.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No appointments scheduled for this selection.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {list.map((app) => (
                <div
                  key={app._id}
                  className={`rounded-xl border p-4 space-y-2 transition-shadow hover:shadow-sm ${statusTone(
                    app.status,
                  )}`}
                >
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>
                      {app.startTime} – {app.endTime}
                    </span>
                    <span className="capitalize">{app.status}</span>
                  </div>
                  <p className="text-sm font-bold truncate">
                    {isDoctor ? patientName(app) : doctorDetails(app).name}
                  </p>
                  <p className="text-xs opacity-80">{appointmentDateKey(app.appointmentDate)}</p>
                  {app.reason ? <p className="text-xs opacity-75 truncate">{app.reason}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AppointmentCard({
  appointment,
  isDoctor,
  isPatient,
  isStaff,
  queueEntry,
  queueLoading,
}: {
  appointment: Appointment;
  isDoctor: boolean;
  isPatient: boolean;
  isStaff: boolean;
  queueEntry?: QueueEntry;
  queueLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [rescheduling, setRescheduling] = useState(false);
  const [recordingConsultation, setRecordingConsultation] = useState(false);
  const [date, setDate] = useState(appointmentDateKey(appointment.appointmentDate));
  const [startTime, setStartTime] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [prescription, setPrescription] = useState("");
  const [consultationNotes, setConsultationNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  // Rejection modal
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Audit trail modal
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);

  const doctor = doctorDetails(appointment);
  const slotsQuery = useQuery({
    queryKey: ["doctor-slots", appointment.doctorId, date],
    queryFn: () =>
      getDoctorSlots(
        typeof appointment.doctorId === "string" ? appointment.doctorId : appointment.doctorId._id,
        date,
      ),
    enabled: rescheduling && !!date,
  });

  const actionMutation = useMutation({
    mutationFn: async (payload: {
      action: "confirm" | "reject" | "cancel" | "reschedule";
      reason?: string;
    }) => {
      if (payload.action === "cancel") return cancelAppointment(appointment._id);
      if (payload.action === "reschedule") {
        return rescheduleAppointment(appointment._id, { appointmentDate: date, startTime });
      }
      const status = payload.action === "confirm" ? "confirmed" : "rejected";
      return updateAppointmentStatus(appointment._id, status, payload.reason);
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      if (variables.action === "reschedule") {
        setRescheduling(false);
        setStartTime("");
      }
      if (variables.action === "reject") {
        setIsRejectDialogOpen(false);
      }
      toast.success(
        variables.action === "cancel" || variables.action === "reschedule"
          ? `Appointment ${variables.action === "cancel" ? "cancelled" : "rescheduled"}.`
          : `Appointment ${variables.action === "confirm" ? "confirmed" : "rejected"}.`,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const checkInMutation = useMutation({
    mutationFn: () => checkInToQueue(appointment._id),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["my-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["today-queue"] });
      toast.success(`Checked in. Queue Token #${data.queueNumber} assigned.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const consultationMutation = useMutation({
    mutationFn: createConsultation,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments"] }),
        queryClient.invalidateQueries({ queryKey: ["consultations"] }),
        queryClient.invalidateQueries({ queryKey: ["my-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["today-queue"] }),
      ]);
      setRecordingConsultation(false);
      toast.success("Consultation recorded successfully.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canChange = appointment.status === "scheduled" || appointment.status === "confirmed";
  const queueActive =
    queueEntry !== undefined &&
    ["waiting", "called", "in_consultation"].includes(queueEntry.status);
  const isToday = appointmentDateKey(appointment.appointmentDate) === clinicDateKey();

  return (
    <article className="surface-card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-48 flex-1">
          <p className="font-semibold text-base">
            {isDoctor ? patientName(appointment) : doctor.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {isDoctor ? "Patient" : doctor.specialization} · {displayDate(appointment)}
          </p>
          {appointment.reason ? (
            <p className="mt-1 text-sm text-muted-foreground">{appointment.reason}</p>
          ) : null}

          {appointment.rejectionReason ? (
            <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
              <span className="font-semibold">Rejection reason:</span> {appointment.rejectionReason}
            </div>
          ) : null}

          {appointment.visitGoals ||
          appointment.symptoms ||
          appointment.allergies ||
          appointment.medications ||
          appointment.questions ? (
            <div className="mt-3 grid gap-2 rounded-lg bg-secondary/60 p-3 text-sm sm:grid-cols-2">
              <p className="font-medium sm:col-span-2">Visit preparation</p>
              {appointment.visitGoals ? (
                <p>
                  <span className="font-medium">Goals:</span> {appointment.visitGoals}
                </p>
              ) : null}
              {appointment.symptoms ? (
                <p>
                  <span className="font-medium">Symptoms:</span> {appointment.symptoms}
                </p>
              ) : null}
              {appointment.allergies ? (
                <p>
                  <span className="font-medium">Allergies:</span> {appointment.allergies}
                </p>
              ) : null}
              {appointment.medications ? (
                <p>
                  <span className="font-medium">Medications:</span> {appointment.medications}
                </p>
              ) : null}
              {appointment.questions ? (
                <p className="sm:col-span-2">
                  <span className="font-medium">Questions:</span> {appointment.questions}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusTone(
              appointment.status,
            )}`}
          >
            {appointment.status === "scheduled"
              ? "requested"
              : appointment.status.replace("_", " ")}
          </span>

          {appointment.auditTrail && appointment.auditTrail.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setIsAuditDialogOpen(true)}
            >
              <History className="size-3" />
              History ({appointment.auditTrail.length})
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {/* Check-in button for patient or hospital staff on clinic date */}
          {(isPatient || isStaff) &&
          appointment.status === "confirmed" &&
          isToday &&
          !queueEntry ? (
            <Button
              size="sm"
              onClick={() => checkInMutation.mutate()}
              disabled={checkInMutation.isPending || queueLoading}
            >
              {checkInMutation.isPending ? "Checking in…" : "Check in"}
            </Button>
          ) : null}

          {/* Doctor response actions */}
          {isDoctor && appointment.status === "scheduled" ? (
            <>
              <Button
                size="sm"
                onClick={() => actionMutation.mutate({ action: "confirm" })}
                disabled={actionMutation.isPending}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRejectionReason("");
                  setIsRejectDialogOpen(true);
                }}
                disabled={actionMutation.isPending}
              >
                Reject
              </Button>
            </>
          ) : null}

          {/* Doctor consultation recording */}
          {isDoctor && appointment.status === "confirmed" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRecordingConsultation((current) => !current)}
            >
              {recordingConsultation ? "Close consultation" : "Record consultation"}
            </Button>
          ) : null}

          {/* Reschedule / Cancel for patient or staff */}
          {(isPatient || isStaff) && canChange ? (
            <>
              {!queueActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDate(appointmentDateKey(appointment.appointmentDate));
                    setRescheduling((current) => !current);
                  }}
                >
                  {rescheduling ? "Close reschedule" : "Reschedule"}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => actionMutation.mutate({ action: "cancel" })}
                disabled={
                  actionMutation.isPending ||
                  queueEntry?.status === "called" ||
                  queueEntry?.status === "in_consultation"
                }
              >
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {isPatient && queueEntry?.status === "waiting" ? (
        <p className="text-sm text-muted-foreground">
          You are checked in. To change this visit, cancel it to leave the queue, then request a new
          appointment time.
        </p>
      ) : null}

      {isPatient &&
      (queueEntry?.status === "called" || queueEntry?.status === "in_consultation") ? (
        <p className="text-sm text-muted-foreground">
          The doctor has called you. This appointment can no longer be cancelled or rescheduled.
        </p>
      ) : null}

      {/* RECORD CONSULTATION FORM */}
      {recordingConsultation ? (
        <form
          className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            consultationMutation.mutate({
              appointmentId: appointment._id,
              symptoms: symptoms.trim() || undefined,
              diagnosis: diagnosis.trim(),
              prescription: prescription.trim() || undefined,
              notes: consultationNotes.trim() || undefined,
              followUpDate: followUpDate || undefined,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`consult-symptoms-${appointment._id}`}>Symptoms</Label>
            <Textarea
              id={`consult-symptoms-${appointment._id}`}
              value={symptoms}
              onChange={(event) => setSymptoms(event.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`consult-diagnosis-${appointment._id}`}>Assessment / Diagnosis</Label>
            <Textarea
              id={`consult-diagnosis-${appointment._id}`}
              value={diagnosis}
              onChange={(event) => setDiagnosis(event.target.value)}
              maxLength={1000}
              rows={2}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`consult-prescription-${appointment._id}`}>Prescription / Plan</Label>
            <Textarea
              id={`consult-prescription-${appointment._id}`}
              value={prescription}
              onChange={(event) => setPrescription(event.target.value)}
              maxLength={3000}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`consult-notes-${appointment._id}`}>Visit Notes</Label>
            <Textarea
              id={`consult-notes-${appointment._id}`}
              value={consultationNotes}
              onChange={(event) => setConsultationNotes(event.target.value)}
              maxLength={3000}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`consult-follow-up-${appointment._id}`}>Follow-up Date</Label>
            <Input
              id={`consult-follow-up-${appointment._id}`}
              type="date"
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={consultationMutation.isPending || !diagnosis.trim()}>
              {consultationMutation.isPending ? "Saving…" : "Save Consultation"}
            </Button>
          </div>
        </form>
      ) : null}

      {/* QUEUE STATUS BADGE & WAIT ESTIMATE */}
      {queueEntry ? (
        <div className="rounded-lg bg-secondary/70 px-4 py-3 text-sm">
          <span className="font-medium">Queue #{queueEntry.queueNumber}</span>
          {" · "}
          <span className="capitalize">{queueEntry.status.replace("_", " ")}</span>
          {queueEntry.status === "called" ? (
            <span className="ml-2 font-medium text-primary">
              Please proceed to the clinic door.
            </span>
          ) : null}
          {queueEntry.status === "waiting" ||
          queueEntry.status === "called" ||
          queueEntry.status === "completed" ? (
            <span className="ml-2">
              <QueueWaitTime
                checkedInAt={queueEntry.checkedInAt}
                endedAt={queueEntry.calledAt ?? queueEntry.completedAt}
              />
              <QueueWaitEstimate
                peopleAhead={queueEntry.peopleAhead}
                estimatedWaitMinutes={queueEntry.estimatedWaitMinutes}
              />
            </span>
          ) : null}
        </div>
      ) : null}

      {/* RESCHEDULE SLOT SELECTOR */}
      {rescheduling ? (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor={`reschedule-date-${appointment._id}`}>New Date</Label>
            <Input
              id={`reschedule-date-${appointment._id}`}
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setStartTime("");
              }}
            />
          </div>
          {slotsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading available times…</p>
          ) : slotsQuery.isError ? (
            <div className="flex items-center gap-3 text-sm" role="alert">
              <span className="text-destructive">Availability could not be loaded.</span>
              <Button variant="outline" size="sm" onClick={() => void slotsQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : slotsQuery.data?.some((slot) => slot.available) ? (
            <div className="flex flex-wrap gap-2">
              {slotsQuery.data
                .filter((slot) => slot.available)
                .map((slot) => (
                  <Button
                    key={slot.startTime}
                    size="sm"
                    variant={startTime === slot.startTime ? "default" : "outline"}
                    aria-pressed={startTime === slot.startTime}
                    onClick={() => setStartTime(slot.startTime)}
                  >
                    {slot.startTime}
                  </Button>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No available times on this date.</p>
          )}
          <Button
            size="sm"
            disabled={!startTime || actionMutation.isPending}
            onClick={() => actionMutation.mutate({ action: "reschedule" })}
          >
            Confirm New Time
          </Button>
        </div>
      ) : null}

      {/* REJECTION REASON DIALOG */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline Appointment Request</DialogTitle>
            <DialogDescription>
              Please supply a clinical or scheduling reason for declining this appointment. The
              patient will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3">
            <Label htmlFor={`reject-reason-${appointment._id}`}>Reason for Rejection</Label>
            <Textarea
              id={`reject-reason-${appointment._id}`}
              rows={3}
              placeholder="e.g. Doctor is in emergency surgery, please rebook for Thursday or consult Dr. Patel"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={actionMutation.isPending || !rejectionReason.trim()}
              onClick={() =>
                actionMutation.mutate({ action: "reject", reason: rejectionReason.trim() })
              }
            >
              {actionMutation.isPending ? "Declining…" : "Confirm Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AUDIT TRAIL MODAL */}
      <Dialog open={isAuditDialogOpen} onOpenChange={setIsAuditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5" />
              Appointment Lifecycle History
            </DialogTitle>
            <DialogDescription>
              Chronological log of changes, status updates, and responsible users.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-80 overflow-y-auto">
            {appointment.auditTrail?.map((entry, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs"
              >
                <div className="size-2 rounded-full bg-primary mt-1 shrink-0" />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground uppercase">{entry.action}</span>
                    <span className="text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    Action recorded by{" "}
                    <span className="font-medium text-foreground">
                      {typeof entry.performedBy === "object"
                        ? entry.performedBy.name
                        : (entry.role ?? "System")}
                    </span>
                    {entry.role ? ` (${entry.role})` : ""}
                  </p>
                  {entry.note ? (
                    <p className="italic text-foreground/80 mt-1">Note: {entry.note}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setIsAuditDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
