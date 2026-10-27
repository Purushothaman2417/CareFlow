import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { ApiError, bookAppointment, getDoctor, getDoctorSlots, getSavedUser } from "@/lib/api";
import { clinicDateKey } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/doctor/$id")({
  head: () => ({
    meta: [
      { title: "Doctor profile — CareFlow" },
      {
        name: "description",
        content: "Professional details for this CareFlow doctor.",
      },
      { property: "og:title", content: "Doctor profile — CareFlow" },
      {
        property: "og:description",
        content: "See a doctor's qualifications, experience, and availability.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DoctorPage,
});

function DoctorPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const signedInUser = getSavedUser();
  const today = clinicDateKey();
  const [date, setDate] = useState(today);
  const [selectedTime, setSelectedTime] = useState("");
  const [reason, setReason] = useState("");
  const [visitGoals, setVisitGoals] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");
  const [questions, setQuestions] = useState("");
  const doctorQuery = useQuery({
    queryKey: ["doctor", id],
    queryFn: () => getDoctor(id),
  });
  const slotsQuery = useQuery({
    queryKey: ["doctor-slots", id, date],
    queryFn: () => getDoctorSlots(id, date),
    enabled: !!doctorQuery.data && !!date,
  });
  const bookingMutation = useMutation({
    mutationFn: () =>
      bookAppointment({
        doctorId: id,
        appointmentDate: date,
        startTime: selectedTime,
        reason: reason.trim(),
        visitGoals: visitGoals.trim(),
        symptoms: symptoms.trim(),
        allergies: allergies.trim(),
        medications: medications.trim(),
        questions: questions.trim(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setSelectedTime("");
      setReason("");
      setVisitGoals("");
      setSymptoms("");
      setAllergies("");
      setMedications("");
      setQuestions("");
      await slotsQuery.refetch();
      toast.success("Appointment requested successfully.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not book this appointment."),
  });
  const doctor = doctorQuery.data;
  const name = doctor && typeof doctor.userId === "object" ? doctor.userId.name : "CareFlow doctor";

  if (doctorQuery.isLoading) {
    return <Skeleton className="mx-auto h-72 w-full max-w-3xl" />;
  }

  if (doctorQuery.isError) {
    const notFound = doctorQuery.error instanceof ApiError && doctorQuery.error.status === 404;

    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link
          to="/doctors"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All doctors
        </Link>
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {notFound
              ? "This doctor profile was not found."
              : "The doctor profile could not be loaded."}
          </p>
          {!notFound ? (
            <Button className="mt-4" variant="outline" onClick={() => void doctorQuery.refetch()}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!doctor) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/doctors"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All doctors
      </Link>

      <article className="surface-card space-y-6 p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Stethoscope className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                {name}
              </h1>
              {doctor.department ? (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {doctor.department}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-0.5">
              {doctor.specialization} · {doctor.qualification}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              doctor.isAvailable
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-border text-muted-foreground"
            }`}
          >
            {doctor.isAvailable ? "Available for Consultations" : "Currently Unavailable"}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 bg-secondary/30 p-4 rounded-xl border border-border">
          {doctor.department ? (
            <div>
              <dt className="text-xs text-muted-foreground">Department</dt>
              <dd className="font-bold text-sm text-foreground">{doctor.department}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">Clinical Specialty</dt>
            <dd className="font-bold text-sm text-foreground">{doctor.specialization}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Experience</dt>
            <dd className="font-bold text-sm text-foreground">{doctor.experienceYears} Years</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Consultation Fee</dt>
            <dd className="font-bold text-sm text-primary">
              ₹{Number(doctor.consultationFee).toLocaleString("en-IN")}
            </dd>
          </div>
        </dl>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Professional Background
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
            {doctor.bio ||
              "Registered medical specialist with verified credentials in the hospital network."}
          </p>
        </section>

        <section className="space-y-4 border-t border-border pt-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">Book Clinical Consultation</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select an appointment date and available time slot in the hospital clinic schedule.
            </p>
          </div>
          {signedInUser?.role === "doctor" ? (
            <p className="rounded-lg bg-secondary/60 p-4 text-xs text-muted-foreground">
              You are signed in as a doctor. To book appointments as a patient, sign in with a
              patient account or book through the reception desk.
            </p>
          ) : (
            <>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="appointment-date">Date</Label>
                <Input
                  id="appointment-date"
                  type="date"
                  min={today}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setSelectedTime("");
                  }}
                  required
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
                <div className="space-y-2">
                  <p className="text-sm font-medium">Available times</p>
                  <div className="flex flex-wrap gap-2">
                    {slotsQuery.data
                      .filter((slot) => slot.available)
                      .map((slot) => (
                        <Button
                          key={slot.startTime}
                          type="button"
                          size="sm"
                          variant={selectedTime === slot.startTime ? "default" : "outline"}
                          aria-pressed={selectedTime === slot.startTime}
                          onClick={() => setSelectedTime(slot.startTime)}
                        >
                          {slot.startTime}
                        </Button>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                  No appointment times are available on this date.
                </p>
              )}

              {selectedTime ? (
                <form
                  className="max-w-lg space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    bookingMutation.mutate();
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="appointment-reason">Reason for visit (optional)</Label>
                    <Textarea
                      id="appointment-reason"
                      value={reason}
                      maxLength={500}
                      rows={3}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </div>
                  <p className="text-sm font-medium">Help your doctor prepare (optional)</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="visit-goals">What would you like help with?</Label>
                    <Textarea
                      id="visit-goals"
                      value={visitGoals}
                      maxLength={1000}
                      rows={2}
                      onChange={(event) => setVisitGoals(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="visit-symptoms">Symptoms and when they started</Label>
                    <Textarea
                      id="visit-symptoms"
                      value={symptoms}
                      maxLength={2000}
                      rows={2}
                      onChange={(event) => setSymptoms(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="visit-allergies">Allergies</Label>
                      <Textarea
                        id="visit-allergies"
                        value={allergies}
                        maxLength={1000}
                        rows={2}
                        onChange={(event) => setAllergies(event.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="visit-medications">Current medications</Label>
                      <Textarea
                        id="visit-medications"
                        value={medications}
                        maxLength={1000}
                        rows={2}
                        onChange={(event) => setMedications(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="visit-questions">Questions for the doctor</Label>
                    <Textarea
                      id="visit-questions"
                      value={questions}
                      maxLength={1000}
                      rows={2}
                      onChange={(event) => setQuestions(event.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={bookingMutation.isPending}>
                    {bookingMutation.isPending ? "Requesting…" : `Request ${selectedTime}`}
                  </Button>
                </form>
              ) : null}
            </>
          )}
        </section>
      </article>
    </div>
  );
}
