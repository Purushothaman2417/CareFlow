import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Users } from "lucide-react";

import { ApiError, getAppointments, getSavedUser, type Appointment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/patients")({
  head: () => ({
    meta: [
      { title: "My patients — CareFlow" },
      { name: "description", content: "Patients who have booked appointments with you." },
      { property: "og:title", content: "My patients — CareFlow" },
      { property: "og:description", content: "Your patient list at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatientsPage,
});

type PatientSummary = {
  id: string;
  name: string;
  appointmentCount: number;
  lastAppointment: Appointment;
};

function getPatientId(appointment: Appointment) {
  return typeof appointment.patientId === "string"
    ? appointment.patientId
    : appointment.patientId._id;
}

function getPatientName(appointment: Appointment) {
  return typeof appointment.patientId === "string" ? "Patient" : appointment.patientId.name;
}

function appointmentDateTime(appointment: Appointment) {
  return `${appointment.appointmentDate.slice(0, 10)}T${appointment.startTime}`;
}

function formatAppointment(appointment: Appointment) {
  const date = new Date(appointment.appointmentDate);
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${dateLabel} at ${appointment.startTime}`;
}

function summarizePatients(appointments: Appointment[]): PatientSummary[] {
  const patients = new Map<string, PatientSummary>();

  for (const appointment of appointments) {
    const id = getPatientId(appointment);
    const existing = patients.get(id);
    if (!existing) {
      patients.set(id, {
        id,
        name: getPatientName(appointment),
        appointmentCount: 1,
        lastAppointment: appointment,
      });
      continue;
    }

    existing.appointmentCount += 1;
    if (appointmentDateTime(appointment) > appointmentDateTime(existing.lastAppointment)) {
      existing.lastAppointment = appointment;
    }
  }

  return [...patients.values()].sort((a, b) =>
    appointmentDateTime(b.lastAppointment).localeCompare(appointmentDateTime(a.lastAppointment)),
  );
}

function PatientsPage() {
  const user = getSavedUser();
  const [search, setSearch] = useState("");
  const appointmentsQuery = useQuery({
    queryKey: ["appointments"],
    queryFn: getAppointments,
    enabled: user?.role === "doctor",
  });
  const patients = useMemo(
    () => summarizePatients(appointmentsQuery.data ?? []),
    [appointmentsQuery.data],
  );
  const filteredPatients = patients.filter((patient) =>
    patient.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My patients</h1>
          <p className="mt-1 text-muted-foreground">
            Patients associated with appointments booked with you.
          </p>
        </div>
        <Input
          className="max-w-xs"
          placeholder="Search by name…"
          aria-label="Search patients by name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {appointmentsQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : appointmentsQuery.isError ? (
        <div className="surface-card space-y-3 p-8 text-center">
          <p className="text-sm text-destructive" role="alert">
            {appointmentsQuery.error instanceof ApiError && appointmentsQuery.error.status === 404
              ? "Your doctor profile could not be found."
              : "Patients could not be loaded."}
          </p>
          <Button variant="outline" onClick={() => void appointmentsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 p-10 text-muted-foreground">
          <Users className="size-8" />
          {patients.length === 0 ? "No patients yet." : "No patients match your search."}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Patient demographics and medical records are not available through the current MERN
            patient API.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPatients.map((patient) => (
              <article key={patient.id} className="surface-card space-y-2 p-5">
                <h2 className="font-display text-lg font-semibold">{patient.name}</h2>
                <p className="text-sm">
                  {patient.appointmentCount} appointment
                  {patient.appointmentCount === 1 ? "" : "s"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Latest: {formatAppointment(patient.lastAppointment)}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
