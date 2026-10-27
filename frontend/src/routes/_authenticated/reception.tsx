import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Building2,
  CalendarCheck2,
  Clock,
  RotateCcw,
  Search,
  Ticket,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

import {
  ApiError,
  checkInToQueue,
  createStaffMember,
  getAppointments,
  getDoctors,
  getHospitalQueues,
  getSavedUser,
  getTodayQueue,
  requeuePatient,
  skipPatient,
  type Appointment,
  type DoctorProfile,
  type QueueEntry,
} from "@/lib/api";
import { clinicDateKey } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QueueWaitTime } from "@/components/QueueWaitTime";
import { QueueWaitEstimate } from "@/components/QueueWaitEstimate";

export const Route = createFileRoute("/_authenticated/reception")({
  head: () => ({
    meta: [
      { title: "Reception Desk — CareFlow" },
      {
        name: "description",
        content: "Patient check-in, token distribution and live hospital queue operations.",
      },
    ],
  }),
  component: ReceptionDeskPage,
});

function ReceptionDeskPage() {
  const user = getSavedUser();
  const queryClient = useQueryClient();
  const today = clinicDateKey();

  const [activeTab, setActiveTab] = useState<"checkin" | "queue" | "register">("checkin");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("all");
  const [generatedToken, setGeneratedToken] = useState<QueueEntry | null>(null);

  // Walk-in Registration form state
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientPassword, setPatientPassword] = useState("Patient@123");
  const [patientPhone, setPatientPhone] = useState("");

  // Skip reason dialog
  const [skipQueueId, setSkipQueueId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState("");

  const isStaff = user?.role === "receptionist" || user?.role === "admin";

  const doctorsQuery = useQuery({
    queryKey: ["doctors"],
    queryFn: () => getDoctors({}),
  });

  const appointmentsQuery = useQuery({
    queryKey: ["appointments"],
    queryFn: getAppointments,
    refetchInterval: 15_000,
  });

  const selectedDoctor =
    selectedDoctorId !== "all"
      ? doctorsQuery.data?.find((d) => d._id === selectedDoctorId)
      : undefined;

  const queueQuery = useQuery({
    queryKey: ["reception-queue", selectedDoctorId],
    queryFn: async () => {
      if (selectedDoctorId === "all") {
        const queues = await getHospitalQueues();
        return queues.flatMap((queue) =>
          queue.entries.map((entry) => ({
            ...entry,
            doctorId: queue.session.doctorId,
          })),
        );
      }
      const queue = await getTodayQueue(selectedDoctorId);
      return queue.entries.map((entry) => ({
        ...entry,
        ...(selectedDoctor ? { doctorId: selectedDoctor } : {}),
      }));
    },
    refetchInterval: 10_000,
  });

  const checkInMutation = useMutation({
    mutationFn: (appointmentId: string) => checkInToQueue(appointmentId),
    onSuccess: (data) => {
      setGeneratedToken(data);
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["today-queue"] });
      toast.success(`Check-in successful! Token #${data.queueNumber} assigned.`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to check in patient.");
    },
  });

  const skipMutation = useMutation({
    mutationFn: ({ queueId, reason }: { queueId: string; reason?: string }) =>
      skipPatient(queueId, reason),
    onSuccess: () => {
      setSkipQueueId(null);
      setSkipReason("");
      void queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["today-queue"] });
      toast.info("Patient marked as skipped.");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not skip patient.");
    },
  });

  const requeueMutation = useMutation({
    mutationFn: (queueId: string) => requeuePatient(queueId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["today-queue"] });
      toast.success("Patient returned to waiting queue.");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not requeue patient.");
    },
  });

  const registerPatientMutation = useMutation({
    mutationFn: () =>
      createStaffMember({
        name: patientName.trim(),
        email: patientEmail.trim(),
        password: patientPassword,
        role: "patient",
        ...(patientPhone.trim() ? { phone: patientPhone.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(`Patient account for ${patientName} created!`);
      setPatientName("");
      setPatientEmail("");
      setPatientPhone("");
      setActiveTab("checkin");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Registration failed.");
    },
  });

  if (!isStaff) {
    return (
      <div className="surface-card space-y-3 p-8 text-center">
        <h1 className="text-xl font-semibold">Access Restricted</h1>
        <p className="text-sm text-muted-foreground">
          The Reception Desk is reserved for authorized hospital receptionists and administrators.
        </p>
      </div>
    );
  }

  // Filter today's confirmed appointments
  const allAppointments = appointmentsQuery.data ?? [];
  const todayAppointments = allAppointments.filter(
    (app) => app.appointmentDate.slice(0, 10) === today,
  );

  const filteredAppointments = todayAppointments.filter((app) => {
    const pName = typeof app.patientId === "object" ? app.patientId.name.toLowerCase() : "";
    const pEmail =
      typeof app.patientId === "object" ? (app.patientId.email?.toLowerCase() ?? "") : "";
    const dName =
      typeof app.doctorId === "object" && typeof app.doctorId.userId === "object"
        ? app.doctorId.userId.name.toLowerCase()
        : "";
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return pName.includes(q) || pEmail.includes(q) || dName.includes(q) || app._id.includes(q);
  });

  const queueEntries: QueueEntry[] = queueQuery.data ?? [];
  const waitingEntries = queueEntries.filter((e) => e.status === "waiting");
  const calledEntries = queueEntries.filter((e) => e.status === "called");
  const inConsultationEntries = queueEntries.filter((e) => e.status === "in_consultation");
  const skippedEntries = queueEntries.filter((e) => e.status === "skipped");
  const completedEntries = queueEntries.filter((e) => e.status === "completed");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Hospital Reception Desk</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage daily arrivals, distribute tokens, and orchestrate real-time clinic queues.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Clinic Desk · {today}
          </span>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "checkin" | "queue" | "register")}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="checkin" className="flex items-center gap-2">
            <UserCheck className="size-4" />
            Arrivals & Check-In
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <Ticket className="size-4" />
            Live Queue (
            {waitingEntries.length + calledEntries.length + inConsultationEntries.length})
          </TabsTrigger>
          <TabsTrigger value="register" className="flex items-center gap-2">
            <UserPlus className="size-4" />
            Quick Walk-In
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ARRIVALS & CHECK-IN */}
        <TabsContent value="checkin" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[280px] max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search patient name, email, or appointment ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Showing {filteredAppointments.length} of {todayAppointments.length} today visits
            </div>
          </div>

          {appointmentsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="surface-card flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <CalendarCheck2 className="size-10 mb-2 opacity-50" />
              <p className="font-medium">No appointments found for today</p>
              <p className="text-sm mt-1">
                Patients who have booked visits for {today} will appear here for check-in.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredAppointments.map((app) => {
                const patient = typeof app.patientId === "object" ? app.patientId : null;
                const doc =
                  typeof app.doctorId === "object" && typeof app.doctorId.userId === "object"
                    ? app.doctorId.userId.name
                    : "Assigned Doctor";
                const specialty =
                  typeof app.doctorId === "object" ? app.doctorId.specialization : "";

                // Check if already checked in in today's queue
                const activeEntry = queueEntries.find(
                  (q) =>
                    typeof q.appointmentId === "object" &&
                    q.appointmentId._id === app._id &&
                    q.status !== "cancelled",
                );

                return (
                  <div
                    key={app._id}
                    className="surface-card flex flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">
                          {patient?.name ?? "Walk-In Patient"}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          {app.startTime} – {app.endTime}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Doctor: <span className="font-medium text-foreground">{doc}</span> (
                        {specialty}) · {patient?.email} {patient?.phone ? `· ${patient.phone}` : ""}
                      </p>
                      {app.reason ? (
                        <p className="text-xs text-muted-foreground/80 italic">
                          Reason: {app.reason}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-3">
                      {activeEntry ? (
                        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                          <Ticket className="size-3.5" />
                          Checked In (Token #{activeEntry.queueNumber})
                        </div>
                      ) : app.status === "confirmed" ? (
                        <Button
                          size="sm"
                          onClick={() => checkInMutation.mutate(app._id)}
                          disabled={checkInMutation.isPending}
                          className="gap-1.5"
                        >
                          <Ticket className="size-4" />
                          Check-In Patient
                        </Button>
                      ) : (
                        <span className="rounded-full border border-border px-2.5 py-1 text-xs capitalize text-muted-foreground">
                          {app.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: LIVE QUEUE CENTRAL */}
        <TabsContent value="queue" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">Filter Doctor:</Label>
              <select
                aria-label="Filter Doctor"
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="all">All Hospital Clinics</option>
                {doctorsQuery.data?.map((d) => (
                  <option key={d._id} value={d._id}>
                    {typeof d.userId === "object" ? d.userId.name : "Doctor"} ({d.specialization})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* IN CONSULTATION & CALLED */}
            <div className="space-y-4 md:col-span-1">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                In Consultation / Called ({inConsultationEntries.length + calledEntries.length})
              </h2>

              {inConsultationEntries.length === 0 && calledEntries.length === 0 ? (
                <div className="surface-card p-6 text-center text-sm text-muted-foreground">
                  No patient currently called or in consultation.
                </div>
              ) : (
                <>
                  {inConsultationEntries.map((entry) => (
                    <div
                      key={entry._id}
                      className="surface-card border-l-4 border-l-emerald-500 p-4 space-y-2 bg-emerald-500/5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          In Consultation
                        </span>
                        <span className="text-lg font-black text-emerald-600">
                          #{entry.queueNumber}
                        </span>
                      </div>
                      <p className="font-semibold text-base">
                        {typeof entry.patientId === "object" ? entry.patientId.name : "Patient"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Doctor:{" "}
                        {typeof entry.doctorId === "object" &&
                        typeof entry.doctorId.userId === "object"
                          ? entry.doctorId.userId.name
                          : "Doctor"}
                      </p>
                    </div>
                  ))}

                  {calledEntries.map((entry) => (
                    <div
                      key={entry._id}
                      className="surface-card border-l-4 border-l-blue-500 p-4 space-y-3 bg-blue-500/5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 animate-pulse">
                          Called to Door
                        </span>
                        <span className="text-lg font-black text-blue-600">
                          #{entry.queueNumber}
                        </span>
                      </div>
                      <p className="font-semibold text-base">
                        {typeof entry.patientId === "object" ? entry.patientId.name : "Patient"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Doctor:{" "}
                        {typeof entry.doctorId === "object" &&
                        typeof entry.doctorId.userId === "object"
                          ? entry.doctorId.userId.name
                          : "Doctor"}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            setSkipQueueId(entry._id);
                            setSkipReason("");
                          }}
                        >
                          Skip
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* SKIPPED PATIENTS */}
              {skippedEntries.length > 0 ? (
                <div className="pt-4 space-y-3">
                  <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                    Skipped Patients ({skippedEntries.length})
                  </h3>
                  {skippedEntries.map((entry) => (
                    <div
                      key={entry._id}
                      className="surface-card p-3 space-y-2 border-dashed border-amber-300 dark:border-amber-800"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-600">Token #{entry.queueNumber}</span>
                        <span className="text-muted-foreground">
                          {typeof entry.patientId === "object" ? entry.patientId.name : "Patient"}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full h-7 text-xs gap-1.5"
                        onClick={() => requeueMutation.mutate(entry._id)}
                        disabled={requeueMutation.isPending}
                      >
                        <RotateCcw className="size-3" />
                        Requeue to Waiting
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* WAITING QUEUE */}
            <div className="space-y-4 md:col-span-2">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                Waiting Patients ({waitingEntries.length})
              </h2>

              {waitingEntries.length === 0 ? (
                <div className="surface-card p-10 text-center text-sm text-muted-foreground">
                  <Clock className="size-8 mx-auto mb-2 opacity-40" />
                  All checked-in patients have been served or called.
                </div>
              ) : (
                <div className="space-y-3">
                  {waitingEntries.map((entry, index) => {
                    const patient = typeof entry.patientId === "object" ? entry.patientId : null;
                    const doc =
                      typeof entry.doctorId === "object" &&
                      typeof entry.doctorId.userId === "object"
                        ? entry.doctorId.userId.name
                        : "Doctor";

                    // Check if waiting > 30 minutes
                    const waitMin = entry.checkedInAt
                      ? Math.round((Date.now() - new Date(entry.checkedInAt).getTime()) / 60000)
                      : 0;
                    const isDelayed = waitMin >= 30;

                    return (
                      <div
                        key={entry._id}
                        className={`surface-card flex flex-wrap items-center justify-between gap-3 p-4 transition-all ${
                          isDelayed ? "border-amber-400/80 bg-amber-500/5" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-lg font-black text-primary">
                            #{entry.queueNumber}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm">{patient?.name ?? "Patient"}</p>
                              {isDelayed ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                  <AlertCircle className="size-3" />
                                  Delayed ({waitMin}m wait)
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Clinic: <span className="font-medium">{doc}</span> · Position #
                              {index + 1}
                            </p>
                          </div>
                        </div>

                        <QueueWaitTime
                          {...(entry.checkedInAt ? { checkedInAt: entry.checkedInAt } : {})}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: QUICK WALK-IN REGISTRATION */}
        <TabsContent value="register" className="space-y-6 max-w-xl">
          <div className="surface-card p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Quick Walk-In Registration</h2>
              <p className="text-sm text-muted-foreground">
                Create an instant patient account to allow immediate consultation booking and
                check-in.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                registerPatientMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="patient-name">Patient Full Name</Label>
                <Input
                  id="patient-name"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patient-email">Patient Email Address</Label>
                <Input
                  id="patient-email"
                  type="email"
                  required
                  placeholder="e.g. ramesh.kumar@example.com"
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patient-phone">Phone Number (Optional)</Label>
                <Input
                  id="patient-phone"
                  placeholder="e.g. +91 98765 43210"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patient-password">Temporary Account Password</Label>
                <Input
                  id="patient-password"
                  required
                  type="text"
                  value={patientPassword}
                  onChange={(e) => setPatientPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Patient can change their password anytime in their Profile settings.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={registerPatientMutation.isPending}
              >
                <UserPlus className="size-4" />
                {registerPatientMutation.isPending ? "Creating Account…" : "Register Patient"}
              </Button>
            </form>
          </div>
        </TabsContent>
      </Tabs>

      {/* GENERATED TOKEN SLIP MODAL */}
      <Dialog open={!!generatedToken} onOpenChange={(open) => !open && setGeneratedToken(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-center font-display text-xl">
              Hospital Queue Token
            </DialogTitle>
            <DialogDescription className="text-center">
              Please hand this token slip or inform the patient.
            </DialogDescription>
          </DialogHeader>

          {generatedToken ? (
            <div className="my-4 space-y-4 rounded-xl border-2 border-dashed border-primary/40 bg-secondary/30 p-6">
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                CareFlow Outpatient Clinic
              </span>
              <div className="text-4xl font-black tracking-tight text-primary">
                #{generatedToken.queueNumber}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Time:{" "}
                  <span className="font-medium text-foreground">
                    {generatedToken.checkedInAt
                      ? new Date(generatedToken.checkedInAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </p>
                <p>
                  Estimated Wait:{" "}
                  <span className="font-medium text-foreground">
                    ~{generatedToken.estimatedWaitMinutes ?? 15} minutes
                  </span>
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setGeneratedToken(null)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SKIP REASON MODAL */}
      <Dialog open={!!skipQueueId} onOpenChange={(open) => !open && setSkipQueueId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Skip Patient</DialogTitle>
            <DialogDescription>
              Mark patient as absent or temporarily skipped. They can be requeued later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3">
            <Label htmlFor="skip-reason">Reason for skipping (Optional)</Label>
            <Input
              id="skip-reason"
              placeholder="e.g. Patient not responding at waiting room"
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipQueueId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={skipMutation.isPending}
              onClick={() => {
                if (skipQueueId) {
                  skipMutation.mutate({ queueId: skipQueueId, reason: skipReason.trim() });
                }
              }}
            >
              {skipMutation.isPending ? "Skipping…" : "Confirm Skip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
