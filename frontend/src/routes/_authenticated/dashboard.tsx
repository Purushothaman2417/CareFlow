import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Bot,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FastForward,
  FileText,
  HeartPulse,
  Play,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Ticket,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ApiError,
  callNextPatient,
  checkInToQueue,
  getAppointments,
  getHospitalQueues,
  getMyQueueEntries,
  getSavedUser,
  getTodayQueue,
  updateAppointmentStatus,
  type Appointment,
  type QueueEntry,
} from "@/lib/api";
import { clinicDateKey } from "@/lib/dates";
import { joinQueueRoom, leaveQueueRoom } from "@/lib/realtime";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueueWaitTime } from "@/components/QueueWaitTime";
import { QueueWaitEstimate } from "@/components/QueueWaitEstimate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CareFlow Hospital OS" },
      {
        name: "description",
        content: "Hospital operations, upcoming consultations, and clinical queues.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const account = getSavedUser();
  const queryClient = useQueryClient();
  const today = clinicDateKey();

  const [rejectingAppointment, setRejectingAppointment] = useState<Appointment | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const appointmentsQuery = useQuery({
    queryKey: ["appointments"],
    enabled: !!account,
    queryFn: getAppointments,
  });
  const rows = appointmentsQuery.data ?? [];

  async function handleConfirm(appointment: Appointment) {
    try {
      await updateAppointmentStatus(appointment._id, "confirmed");
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment confirmed.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not confirm appointment.");
    }
  }

  async function handleRejectConfirm() {
    if (!rejectingAppointment) return;
    try {
      await updateAppointmentStatus(rejectingAppointment._id, "rejected", rejectionReason.trim());
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setRejectingAppointment(null);
      setRejectionReason("");
      toast.info("Appointment rejected.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not reject appointment.");
    }
  }

  if (appointmentsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const role = account?.role ?? "patient";
  const isDoctor = role === "doctor";
  const isReceptionist = role === "receptionist";
  const isAdmin = role === "admin";
  const isPatient = role === "patient";

  const pending = rows.filter((row) => row.status === "scheduled");
  const confirmed = rows.filter((row) => row.status === "confirmed");
  const upcoming = confirmed.filter((row) => row.appointmentDate.slice(0, 10) >= today);

  if (appointmentsQuery.isError) {
    return (
      <div className="surface-card p-10 text-center space-y-4">
        <p className="text-sm text-destructive" role="alert">
          Dashboard clinical data could not be loaded.
        </p>
        <Button variant="outline" onClick={() => void appointmentsQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* WORKSPACE TOP HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              {isDoctor
                ? "Clinician Workspace"
                : isReceptionist
                  ? "Hospital Front Desk Console"
                  : isAdmin
                    ? "Executive Operations Console"
                    : "Patient Health Portal"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{today}</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Welcome back, {account?.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {isDoctor ? (
            <Button asChild size="sm" className="gap-1.5 shadow-sm">
              <Link to="/appointments">
                <CalendarCheck2 className="size-4" />
                View Full Schedule
              </Link>
            </Button>
          ) : isReceptionist ? (
            <Button asChild size="sm" className="gap-1.5 shadow-sm">
              <Link to="/reception">
                <ClipboardCheck className="size-4" />
                Open Reception Desk
              </Link>
            </Button>
          ) : isAdmin ? (
            <Button asChild size="sm" className="gap-1.5 shadow-sm">
              <Link to="/admin">
                <TrendingUp className="size-4" />
                Executive Console
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="gap-1.5 shadow-sm">
              <Link to="/doctors">
                <Stethoscope className="size-4" />
                Find a Doctor
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* DOCTOR WORKSPACE VIEW */}
      {isDoctor ? (
        <DoctorDashboardView
          pending={pending}
          confirmed={confirmed}
          upcoming={upcoming}
          onConfirm={handleConfirm}
          onReject={(app) => {
            setRejectingAppointment(app);
            setRejectionReason("");
          }}
        />
      ) : null}

      {/* RECEPTIONIST WORKSPACE VIEW */}
      {isReceptionist ? (
        <ReceptionistDashboardView
          todayAppointments={rows.filter((r) => r.appointmentDate.slice(0, 10) === today)}
        />
      ) : null}

      {/* ADMIN WORKSPACE VIEW */}
      {isAdmin ? <AdminDashboardView allAppointments={rows} /> : null}

      {/* PATIENT PORTAL VIEW */}
      {isPatient ? <PatientDashboardView upcoming={upcoming} rows={rows} /> : null}

      {/* REJECTION REASON MODAL FOR CLINICIANS */}
      <Dialog
        open={!!rejectingAppointment}
        onOpenChange={(open) => !open && setRejectingAppointment(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline Appointment Request</DialogTitle>
            <DialogDescription>
              Please enter the clinical or schedule reason for declining. The patient will be
              notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3">
            <Label htmlFor="rejection-reason">Reason for declining</Label>
            <Textarea
              id="rejection-reason"
              rows={3}
              placeholder="e.g. Schedule clash with operating room emergency; please rebook for Wednesday"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingAppointment(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim()}
              onClick={handleRejectConfirm}
            >
              Confirm Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. DOCTOR DASHBOARD VIEW
// ---------------------------------------------------------------------------
function DoctorDashboardView({
  pending,
  confirmed,
  upcoming,
  onConfirm,
  onReject,
}: {
  pending: Appointment[];
  confirmed: Appointment[];
  upcoming: Appointment[];
  onConfirm: (app: Appointment) => void;
  onReject: (app: Appointment) => void;
}) {
  return (
    <div className="space-y-8">
      {/* KPI METRIC CARDS */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5 space-y-1 border-l-4 border-l-amber-500">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pending Approval
          </span>
          <div className="text-3xl font-black">{pending.length}</div>
          <p className="text-xs text-muted-foreground">Awaiting your confirmation</p>
        </div>

        <div className="surface-card p-5 space-y-1 border-l-4 border-l-emerald-500">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Confirmed Visits
          </span>
          <div className="text-3xl font-black text-emerald-600">{confirmed.length}</div>
          <p className="text-xs text-muted-foreground">Booked consultations</p>
        </div>

        <div className="surface-card p-5 space-y-1 border-l-4 border-l-primary">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming on Calendar
          </span>
          <div className="text-3xl font-black text-primary">{upcoming.length}</div>
          <p className="text-xs text-muted-foreground">From today onwards</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* DOCTOR QUEUE LIVE PANEL */}
        <div className="lg:col-span-7 space-y-6">
          <DoctorQueuePanel />
        </div>

        {/* PENDING APPOINTMENT REQUESTS */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">
              Appointment Requests ({pending.length})
            </h2>
            <Link to="/appointments" className="text-xs font-semibold text-primary hover:underline">
              View All &rarr;
            </Link>
          </div>

          {pending.length === 0 ? (
            <div className="surface-card p-8 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500/60" />
              All appointment requests have been reviewed.
            </div>
          ) : (
            <div className="space-y-3">
              {pending.slice(0, 4).map((row) => (
                <div key={row._id} className="surface-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-foreground">
                        {typeof row.patientId === "object" ? row.patientId.name : "Patient"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.appointmentDate.slice(0, 10)} · {row.startTime} – {row.endTime}
                      </p>
                    </div>
                    <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                      Requested
                    </span>
                  </div>

                  {row.reason ? (
                    <p className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
                      <span className="font-semibold text-foreground">Reason:</span> {row.reason}
                    </p>
                  ) : null}

                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" className="h-8 text-xs flex-1" onClick={() => onConfirm(row)}>
                      Accept Visit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs flex-1 text-destructive hover:bg-destructive/10"
                      onClick={() => onReject(row)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. RECEPTIONIST DASHBOARD VIEW
// ---------------------------------------------------------------------------
function ReceptionistDashboardView({ todayAppointments }: { todayAppointments: Appointment[] }) {
  const queryClient = useQueryClient();
  const today = clinicDateKey();

  const queueQuery = useQuery({
    queryKey: ["reception-queue", "all"],
    queryFn: async () => {
      const queues = await getHospitalQueues();
      return queues.flatMap((queue) =>
        queue.entries.map((entry) => ({
          ...entry,
          doctorId: queue.session.doctorId,
        })),
      );
    },
    refetchInterval: 10_000,
  });

  const checkInMutation = useMutation({
    mutationFn: (appointmentId: string) => checkInToQueue(appointmentId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
      toast.success(`Patient checked in! Token #${data.queueNumber} issued.`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Check-in failed.");
    },
  });

  const queueEntries: QueueEntry[] = queueQuery.data ?? [];
  const waitingEntries = queueEntries.filter((e) => e.status === "waiting");
  const inConsultationEntries = queueEntries.filter((e) => e.status === "in_consultation");

  return (
    <div className="space-y-8">
      {/* STATS */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-5 space-y-1 border-l-4 border-l-primary">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Today's Visits
          </span>
          <div className="text-3xl font-black text-primary">{todayAppointments.length}</div>
          <p className="text-xs text-muted-foreground">Scheduled for {today}</p>
        </div>

        <div className="surface-card p-5 space-y-1 border-l-4 border-l-amber-500">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Waiting in Lounge
          </span>
          <div className="text-3xl font-black text-amber-600">{waitingEntries.length}</div>
          <p className="text-xs text-muted-foreground">Checked-in and waiting</p>
        </div>

        <div className="surface-card p-5 space-y-1 border-l-4 border-l-emerald-500">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Currently in Clinics
          </span>
          <div className="text-3xl font-black text-emerald-600">{inConsultationEntries.length}</div>
          <p className="text-xs text-muted-foreground">In consultation with doctors</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* TODAY ARRIVALS CHECK-IN TABLE */}
        <div className="lg:col-span-8 surface-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Today's Patient Arrivals</h2>
              <p className="text-xs text-muted-foreground">
                Check in patients as they arrive at the lobby desk
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/reception">Full Desk View &rarr;</Link>
            </Button>
          </div>

          {todayAppointments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No visits booked for today.
            </p>
          ) : (
            <div className="space-y-3">
              {todayAppointments.slice(0, 5).map((app) => {
                const isCheckedIn = queueEntries.some(
                  (q) =>
                    typeof q.appointmentId === "object" &&
                    q.appointmentId._id === app._id &&
                    q.status !== "cancelled",
                );

                return (
                  <div
                    key={app._id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-border bg-secondary/30"
                  >
                    <div>
                      <p className="font-bold text-sm">
                        {typeof app.patientId === "object" ? app.patientId.name : "Patient"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Doctor:{" "}
                        {typeof app.doctorId === "object" && typeof app.doctorId.userId === "object"
                          ? app.doctorId.userId.name
                          : "Doctor"}{" "}
                        · {app.startTime}
                      </p>
                    </div>

                    {isCheckedIn ? (
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600">
                        Checked In
                      </span>
                    ) : app.status === "confirmed" ? (
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => checkInMutation.mutate(app._id)}
                        disabled={checkInMutation.isPending}
                      >
                        <Ticket className="size-3.5" />
                        Check In
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground capitalize">{app.status}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* QUICK DESK ACTIONS */}
        <div className="lg:col-span-4 space-y-4">
          <div className="surface-card p-5 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Desk Shortcuts
            </h3>
            <div className="grid gap-2">
              <Button asChild variant="outline" className="justify-start gap-2 h-11">
                <Link to="/reception">
                  <ClipboardCheck className="size-4 text-teal-600" />
                  <span>Open Live Queue Central</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start gap-2 h-11">
                <Link to="/reception">
                  <UserPlus className="size-4 text-blue-600" />
                  <span>Register Walk-in Patient</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start gap-2 h-11">
                <Link to="/doctors">
                  <Stethoscope className="size-4 text-primary" />
                  <span>Check Doctor Availability</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. ADMIN DASHBOARD VIEW
// ---------------------------------------------------------------------------
function AdminDashboardView({ allAppointments }: { allAppointments: Appointment[] }) {
  const completed = allAppointments.filter((a) => a.status === "completed").length;
  const confirmed = allAppointments.filter((a) => a.status === "confirmed").length;
  const cancelled = allAppointments.filter((a) => a.status === "cancelled").length;

  return (
    <div className="space-y-8">
      {/* KPIS */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="surface-card p-5 space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total Bookings
          </span>
          <div className="text-3xl font-black">{allAppointments.length}</div>
          <p className="text-xs text-muted-foreground">Platform-wide records</p>
        </div>

        <div className="surface-card p-5 space-y-1 border-l-4 border-l-emerald-500">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Completed Visits
          </span>
          <div className="text-3xl font-black text-emerald-600">{completed}</div>
          <p className="text-xs text-muted-foreground">Finished consultations</p>
        </div>

        <div className="surface-card p-5 space-y-1 border-l-4 border-l-primary">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Confirmed
          </span>
          <div className="text-3xl font-black text-primary">{confirmed}</div>
          <p className="text-xs text-muted-foreground">Scheduled & verified</p>
        </div>

        <div className="surface-card p-5 space-y-1 border-l-4 border-l-amber-500">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cancellations
          </span>
          <div className="text-3xl font-black text-amber-600">{cancelled}</div>
          <p className="text-xs text-muted-foreground">Missed or revoked</p>
        </div>
      </div>

      <div className="surface-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Executive Hospital Administration</h2>
            <p className="text-xs text-muted-foreground">
              Access real aggregation reports, staff directory access controls, and security audit
              logs.
            </p>
          </div>
          <Button asChild>
            <Link to="/admin" className="gap-1.5">
              <TrendingUp className="size-4" />
              Open Admin Console &rarr;
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. PATIENT DASHBOARD VIEW
// ---------------------------------------------------------------------------
function PatientDashboardView({
  upcoming,
  rows,
}: {
  upcoming: Appointment[];
  rows: Appointment[];
}) {
  const queryClient = useQueryClient();
  const today = clinicDateKey();

  const queueQuery = useQuery({
    queryKey: ["my-queue"],
    queryFn: getMyQueueEntries,
    refetchInterval: 10_000,
  });

  const checkInMutation = useMutation({
    mutationFn: (appointmentId: string) => checkInToQueue(appointmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Checked in! Your digital queue token is active.");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Check-in failed.");
    },
  });

  const activeQueue = queueQuery.data?.find((q) =>
    ["waiting", "called", "in_consultation"].includes(q.status),
  );

  const nextAppointment = upcoming[0];
  const isNextToday = nextAppointment && nextAppointment.appointmentDate.slice(0, 10) === today;

  return (
    <div className="space-y-8">
      {/* ACTIVE QUEUE TOKEN BANNER (IF PATIENT IS CURRENTLY IN QUEUE) */}
      {activeQueue ? (
        <div className="surface-card p-6 border-2 border-primary/40 bg-gradient-to-r from-primary/10 via-background to-background rounded-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
                <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                Live Clinic Queue Active
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Your Queue Token: #{activeQueue.queueNumber}
              </h2>
              <p className="text-sm text-muted-foreground">
                Status:{" "}
                <strong className="capitalize text-foreground">
                  {activeQueue.status.replace("_", " ")}
                </strong>
                {activeQueue.status === "called"
                  ? " — Please proceed to your doctor's consultation room door now."
                  : " — Please remain in the patient waiting area."}
              </p>
            </div>

            <div className="flex items-center gap-4 bg-background/80 p-4 rounded-xl border border-border">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Estimated Wait</p>
                <p className="text-xl font-bold text-emerald-600">
                  ~{activeQueue.estimatedWaitMinutes ?? 12} mins
                </p>
              </div>
              <div className="text-right border-l border-border pl-4">
                <p className="text-xs text-muted-foreground">People Ahead</p>
                <p className="text-xl font-bold text-foreground">{activeQueue.peopleAhead ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* QUICK PATIENT SERVICES */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          to="/doctors"
          className="surface-card-hover p-5 space-y-2 border-l-4 border-l-primary group block"
        >
          <div className="flex items-center justify-between">
            <span className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Stethoscope className="size-5" />
            </span>
            <ArrowRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
          <h3 className="font-bold text-base text-foreground">Find Specialist Doctors</h3>
          <p className="text-xs text-muted-foreground">
            Search verified specialists by department, experience, and fee.
          </p>
        </Link>

        <Link
          to="/records"
          className="surface-card-hover p-5 space-y-2 border-l-4 border-l-emerald-500 group block"
        >
          <div className="flex items-center justify-between">
            <span className="size-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <FileText className="size-5" />
            </span>
            <ArrowRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
          <h3 className="font-bold text-base text-foreground">My Health Records</h3>
          <p className="text-xs text-muted-foreground">
            Access past consultation notes, diagnoses, and digital prescriptions.
          </p>
        </Link>

        <Link
          to="/assistant"
          className="surface-card-hover p-5 space-y-2 border-l-4 border-l-sky-500 group block"
        >
          <div className="flex items-center justify-between">
            <span className="size-10 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
              <Bot className="size-5" />
            </span>
            <ArrowRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
          <h3 className="font-bold text-base text-foreground">CareFlow Assistant</h3>
          <p className="text-xs text-muted-foreground">
            Ask health questions, prepare visit notes, and check symptoms.
          </p>
        </Link>
      </div>

      {/* UPCOMING APPOINTMENTS SECTION */}
      <div className="surface-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Upcoming Consultations</h2>
            <p className="text-xs text-muted-foreground">Confirmed and scheduled hospital visits</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/appointments">All Appointments &rarr;</Link>
          </Button>
        </div>

        {upcoming.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground space-y-3">
            <CalendarClock className="size-8 mx-auto opacity-40" />
            <p>You have no upcoming consultations scheduled.</p>
            <Button asChild size="sm">
              <Link to="/doctors">Book an Appointment Now</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((row) => {
              const docName =
                typeof row.doctorId === "object" && typeof row.doctorId.userId === "object"
                  ? row.doctorId.userId.name
                  : "Doctor";
              const docSpec =
                typeof row.doctorId === "object" ? row.doctorId.specialization : "Specialist";
              const isToday = row.appointmentDate.slice(0, 10) === today;

              return (
                <div
                  key={row._id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-secondary/20"
                >
                  <div className="space-y-1">
                    <p className="font-bold text-base text-foreground">{docName}</p>
                    <p className="text-xs text-muted-foreground">
                      {docSpec} · {row.appointmentDate.slice(0, 10)} · {row.startTime} –{" "}
                      {row.endTime}
                    </p>
                    {row.reason ? (
                      <p className="text-xs text-muted-foreground/90 italic">
                        Reason: {row.reason}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 capitalize">
                      {row.status}
                    </span>

                    {isToday && !activeQueue ? (
                      <Button
                        size="sm"
                        onClick={() => checkInMutation.mutate(row._id)}
                        disabled={checkInMutation.isPending}
                        className="gap-1.5"
                      >
                        <Ticket className="size-3.5" />
                        Check In for Token
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DOCTOR QUEUE PANEL COMPONENT
// ---------------------------------------------------------------------------
function DoctorQueuePanel() {
  const queryClient = useQueryClient();
  const queueQuery = useQuery({
    queryKey: ["today-queue"],
    queryFn: () => getTodayQueue(),
    refetchInterval: 10_000,
  });

  const entries: QueueEntry[] = queueQuery.data?.entries ?? [];
  const waitingEntries = entries.filter((e) => e.status === "waiting");
  const calledEntry = entries.find((e) => e.status === "called");
  const inConsultation = entries.find((e) => e.status === "in_consultation");

  const callNextMutation = useMutation({
    mutationFn: () => callNextPatient(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["today-queue"] });
      if (data) {
        toast.success(`Patient Token #${data.queueNumber} called to clinic!`);
      } else {
        toast.info("No waiting patients in queue.");
      }
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not call patient.");
    },
  });

  return (
    <div className="surface-card p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Clinic Queue Telemetry</h2>
          <p className="text-xs text-muted-foreground">
            {waitingEntries.length} waiting · {entries.length} total arrived today
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => callNextMutation.mutate()}
          disabled={waitingEntries.length === 0 || callNextMutation.isPending}
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <FastForward className="size-4" />
          {callNextMutation.isPending ? "Calling…" : "Call Next Patient"}
        </Button>
      </div>

      {/* ACTIVE CALL / IN CONSULTATION */}
      {inConsultation ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-600 uppercase">In Consultation</span>
            <span className="font-mono font-bold text-lg text-emerald-600">
              TOKEN #{inConsultation.queueNumber}
            </span>
          </div>
          <p className="font-bold text-base text-foreground">
            {typeof inConsultation.patientId === "object"
              ? inConsultation.patientId.name
              : "Patient"}
          </p>
          <p className="text-xs text-muted-foreground">
            Consultation underway in this clinic room.
          </p>
        </div>
      ) : calledEntry ? (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-blue-600 uppercase animate-pulse">Called to Door</span>
            <span className="font-mono font-bold text-lg text-blue-600">
              TOKEN #{calledEntry.queueNumber}
            </span>
          </div>
          <p className="font-bold text-base text-foreground">
            {typeof calledEntry.patientId === "object" ? calledEntry.patientId.name : "Patient"}
          </p>
          <p className="text-xs text-muted-foreground">
            Patient notified to proceed to clinic door.
          </p>
        </div>
      ) : null}

      {/* WAITING LIST */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Waiting Queue Line
        </p>

        {waitingEntries.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No patients waiting in queue.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {waitingEntries.map((e, index) => (
              <div
                key={e._id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-secondary/30 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded bg-primary/10 font-bold text-primary">
                    #{e.queueNumber}
                  </span>
                  <div>
                    <p className="font-bold text-foreground">
                      {typeof e.patientId === "object" ? e.patientId.name : "Patient"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Position #{index + 1}</p>
                  </div>
                </div>

                <QueueWaitTime {...(e.checkedInAt ? { checkedInAt: e.checkedInAt } : {})} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
