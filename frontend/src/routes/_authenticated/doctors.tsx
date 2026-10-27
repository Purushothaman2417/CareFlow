import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Stethoscope } from "lucide-react";

import { getDepartments, getDoctors } from "@/lib/api";
import { SPECIALTIES } from "@/lib/specialties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/doctors")({
  head: () => ({
    meta: [
      { title: "Find doctors — CareFlow" },
      {
        name: "description",
        content: "Search CareFlow doctors by name, specialty and qualifications.",
      },
      { property: "og:title", content: "Find doctors — CareFlow" },
      {
        property: "og:description",
        content: "Search real doctor profiles from the CareFlow directory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DoctorsPage,
});

function DoctorsPage() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [specialization, setSpecialization] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState<"newest" | "name" | "experience" | "fee">("newest");

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: getDepartments,
  });

  const doctorsQuery = useQuery({
    queryKey: ["doctors", search, department, specialization, availability, sort],
    queryFn: () =>
      getDoctors({
        search,
        department: department === "all" ? undefined : department,
        specialization: specialization === "all" ? undefined : specialization,
        availability: availability === "all" ? undefined : availability === "available",
        sort,
      }),
  });

  const doctors = doctorsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Find a doctor</h1>
        <p className="mt-2 text-muted-foreground">
          Browse doctor profiles and their professional details.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search doctors or qualifications"
            aria-label="Search doctors"
            className="pl-9"
          />
        </div>
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-52" aria-label="Filter by department">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departmentsQuery.data?.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={specialization} onValueChange={setSpecialization}>
          <SelectTrigger className="w-56" aria-label="Filter by specialty">
            <SelectValue placeholder="All specialties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All specialties</SelectItem>
            {SPECIALTIES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={availability} onValueChange={setAvailability}>
          <SelectTrigger className="w-48" aria-label="Filter by availability">
            <SelectValue placeholder="Any availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any availability</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(value) => setSort(value as "newest" | "name" | "experience" | "fee")}
        >
          <SelectTrigger className="w-48" aria-label="Sort doctors">
            <SelectValue placeholder="Sort doctors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Recently added</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="experience">Experience</SelectItem>
            <SelectItem value="fee">Fee (lowest first)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {doctorsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : doctorsQuery.isError ? (
        <div className="rounded-xl border border-destructive/30 p-8 text-center" role="alert">
          <p className="text-sm text-muted-foreground">The doctor directory could not be loaded.</p>
          <Button className="mt-4" variant="outline" onClick={() => void doctorsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : doctors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No doctor profiles match these filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {doctors.map((doctor) => {
            const name = typeof doctor.userId === "object" ? doctor.userId.name : "CareFlow doctor";

            return (
              <article key={doctor._id} className="surface-card flex flex-col p-6">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
                    <Stethoscope className="size-5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{name}</h2>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm text-primary">{doctor.specialization}</p>
                      {doctor.department ? (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {doctor.department}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={`ml-auto shrink-0 rounded-full border px-2.5 py-1 text-xs ${
                      doctor.isAvailable
                        ? "border-success/30 text-success"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {doctor.isAvailable ? "Available" : "Unavailable"}
                  </span>
                </div>

                <p className="mt-4 text-sm text-muted-foreground">
                  {doctor.bio || "No professional biography has been added."}
                </p>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {doctor.department ? (
                    <div>
                      <dt className="text-muted-foreground">Department</dt>
                      <dd className="font-medium">{doctor.department}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">Qualification</dt>
                    <dd className="font-medium">{doctor.qualification}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Experience</dt>
                    <dd className="font-medium">{doctor.experienceYears} years</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Consultation fee</dt>
                    <dd className="font-medium">
                      ₹{Number(doctor.consultationFee).toLocaleString("en-IN")}
                    </dd>
                  </div>
                </dl>

                <Button asChild className="mt-6">
                  <Link to="/doctor/$id" params={{ id: doctor._id }}>
                    View profile
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
