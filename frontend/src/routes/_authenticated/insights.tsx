import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ApiError, getInsights, getSavedUser, type Appointment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Insights — CareFlow" },
      {
        name: "description",
        content: "Appointment trends, status breakdowns and platform statistics.",
      },
      { property: "og:title", content: "Insights — CareFlow" },
      { property: "og:description", content: "Healthcare analytics at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});

const STATUS_COLORS: Record<Appointment["status"], string> = {
  scheduled: "var(--warning)",
  confirmed: "var(--primary)",
  completed: "var(--success)",
  rejected: "var(--destructive)",
  cancelled: "var(--muted-foreground)",
  no_show: "var(--muted-foreground)",
};

function formatAppointmentDate(appointment: Appointment) {
  const date = new Date(appointment.appointmentDate);
  const formattedDate = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formattedDate} · ${appointment.startTime}`;
}

function patientName(appointment: Appointment) {
  return typeof appointment.patientId === "object" ? appointment.patientId.name : "—";
}

function doctorDetails(appointment: Appointment) {
  if (typeof appointment.doctorId === "string") {
    return { name: "—", specialization: "Other" };
  }
  return {
    name: typeof appointment.doctorId.userId === "object" ? appointment.doctorId.userId.name : "—",
    specialization: appointment.doctorId.specialization || "Other",
  };
}

function InsightsPage() {
  const user = getSavedUser();
  const isAdmin = user?.role === "admin";
  const insightsQuery = useQuery({
    queryKey: ["insights", user?.id],
    queryFn: getInsights,
    enabled: !!user,
  });
  const insights = insightsQuery.data;

  if (insightsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (insightsQuery.isError || !insights) {
    const forbidden = insightsQuery.error instanceof ApiError && insightsQuery.error.status === 403;
    return (
      <div className="surface-card space-y-4 p-10 text-center">
        <p className="text-sm text-destructive" role="alert">
          {forbidden
            ? "Insights are not available for this account."
            : "Insights could not be loaded."}
        </p>
        {!forbidden ? (
          <Button variant="outline" onClick={() => void insightsQuery.refetch()}>
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  const monthlyCounts = new Map(insights.monthly.map((item) => [item.month, item.count]));
  const monthLabels = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (5 - index));
    const month = date.toISOString().slice(0, 7);
    return {
      month,
      label: date.toLocaleString(undefined, { month: "short", timeZone: "UTC" }),
      count: monthlyCounts.get(month) ?? 0,
    };
  });
  const stats = [
    { label: "Appointments", value: insights.total },
    { label: "Completed", value: insights.completed },
    { label: "Requested", value: insights.scheduled },
    ...(isAdmin
      ? [
          { label: "Registered doctors", value: insights.registeredDoctors ?? 0 },
          { label: "Registered patients", value: insights.registeredPatients ?? 0 },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">
          {isAdmin ? "Admin overview" : "Insights"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {isAdmin
            ? "Platform-wide activity across doctors and patients."
            : "Your appointment activity."}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="surface-card p-4">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="font-display text-3xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Last 6 months</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthLabels}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="surface-card p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">By status</h2>
          {insights.byStatus.length === 0 ? (
            <p className="py-20 text-center text-muted-foreground">No appointments yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={insights.byStatus}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  label
                >
                  {insights.byStatus.map((status) => (
                    <Cell key={status.name} fill={STATUS_COLORS[status.name]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        {insights.bySpecialty.length > 0 ? (
          <section className="surface-card p-5 lg:col-span-2">
            <h2 className="mb-4 font-display text-lg font-semibold">By specialty</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={insights.bySpecialty} layout="vertical">
                <XAxis
                  type="number"
                  allowDecimals={false}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                />
                <Tooltip />
                <Bar dataKey="count" fill="var(--accent)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        ) : null}
      </div>

      {isAdmin ? (
        <section className="surface-card overflow-x-auto p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Recent appointments</h2>
          {insights.recentAppointments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No appointments yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-2">When</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {insights.recentAppointments.map((appointment) => {
                  const doctor = doctorDetails(appointment);
                  return (
                    <tr key={appointment._id} className="border-t border-border">
                      <td className="py-2">{formatAppointmentDate(appointment)}</td>
                      <td>{patientName(appointment)}</td>
                      <td>{doctor.name}</td>
                      <td className="capitalize">{appointment.status.replace("_", " ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </div>
  );
}
