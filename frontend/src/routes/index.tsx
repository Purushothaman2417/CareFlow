import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Brain,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Heart,
  HeartPulse,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Ticket,
  UserCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareFlow — Smart Hospital & Clinic Operating System" },
      {
        name: "description",
        content:
          "CareFlow connects patients, doctors, reception desks, and hospital administration in a unified real-time clinical platform.",
      },
      { property: "og:title", content: "CareFlow — Smart Hospital Management" },
      {
        property: "og:description",
        content: "Intelligent scheduling, digital queue telemetry, and verified health records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const CLINICAL_DEPARTMENTS = [
  {
    name: "General Medicine",
    icon: Stethoscope,
    description:
      "Primary diagnostic evaluations, preventive screenings, and routine clinical care.",
    badge: "Outpatient Block A",
  },
  {
    name: "Cardiology",
    icon: Heart,
    description: "Cardiac telemetry, hypertension management, ECG review, and heart health.",
    badge: "Cardiovascular Wing",
  },
  {
    name: "Neurology",
    icon: Brain,
    description: "Neurological consultations, chronic migraine care, and cognitive wellness.",
    badge: "Neurosciences Pavilion",
  },
  {
    name: "Pediatrics",
    icon: HeartPulse,
    description: "Child health wellness, growth tracking, vaccinations, and pediatric medicine.",
    badge: "Maternal & Child Wing",
  },
];

const HOSPITAL_STATS = [
  { value: "100%", label: "Digital Queue Telemetry", sub: "Zero manual lobby congestion" },
  { value: "< 15 min", label: "Average Patient Wait", sub: "Dynamic wait time estimation" },
  { value: "4 Distinct", label: "Role Workspaces", sub: "Patients, Doctors, Desk & Admins" },
  { value: "256-Bit", label: "Encrypted Records", sub: "Strict RBAC & audit trail" },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 selection:text-primary">
      {/* HOSPITAL EMERGENCY & NETWORK BANNER */}
      <div className="border-b border-border/80 bg-secondary/50 px-4 py-2 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-foreground">CareFlow Health System</span>
            <span className="hidden md:inline">
              · Central Teaching Hospital & Multi-Specialty Clinics
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 font-medium text-foreground">
              <PhoneCall className="size-3.5 text-primary" />
              <span>
                Emergency Response: <strong>108 / 080-2440-1000</strong>
              </span>
            </div>
            <Link
              to="/auth"
              className="font-semibold text-primary hover:underline hover:text-primary/80"
            >
              Staff Portal Access &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* TOP NAVIGATION HEADER */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky-600 shadow-sm text-white">
              <HeartPulse className="size-5" />
            </span>
            <div className="flex flex-col">
              <span className="font-display text-xl font-bold tracking-tight text-foreground leading-none">
                CareFlow
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Smart Hospital OS
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#departments" className="hover:text-foreground transition-colors">
              Clinical Specialties
            </a>
            <a href="#workspaces" className="hover:text-foreground transition-colors">
              Hospital Workspaces
            </a>
            <a href="#telemetry" className="hover:text-foreground transition-colors">
              Queue Telemetry
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5 shadow-sm">
              <Link to="/auth">
                Book Consultation
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-16 md:pb-28 border-b border-border/60 bg-gradient-to-b from-secondary/30 via-background to-background">
        <div className="mx-auto max-w-7xl px-4 grid gap-12 lg:grid-cols-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" />
              Unified Healthcare Workflow Architecture
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl text-foreground leading-[1.1]">
              The Hospital Operating Platform Built for{" "}
              <span className="bg-gradient-to-r from-primary via-sky-600 to-teal-500 bg-clip-text text-transparent">
                Real Clinical Precision.
              </span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
              CareFlow eliminates waiting room congestion through real-time queue tokens,
              synchronizes verified doctor availability, and bridges patients, clinicians, reception
              desks, and hospital administrators.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="lg" className="gap-2 shadow-md">
                <Link to="/auth">
                  <CalendarCheck className="size-4" />
                  Book an Appointment
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="gap-2">
                <Link to="/auth">
                  <UserCheck className="size-4" />
                  Clinician & Staff Sign In
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs font-medium text-muted-foreground border-t border-border/80">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Live Socket.IO Telemetry
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Double-Booking Guarded
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Immutable Audit Trail
              </span>
            </div>
          </div>

          {/* INTERACTIVE CLINICAL PREVIEW CARD */}
          <div className="lg:col-span-5">
            <div className="surface-card p-6 shadow-xl space-y-5 border-2 border-primary/10 relative">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="font-semibold text-sm">Outpatient Clinic Live Monitor</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">ROOM 104 · ACTIVE</span>
              </div>

              {/* CURRENTLY CALLED PATIENT BADGE */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-primary uppercase tracking-wider">
                    Currently in Consultation
                  </span>
                  <span className="font-mono font-bold text-lg text-primary">TOKEN #04</span>
                </div>
                <p className="font-bold text-base text-foreground">Dr. Asha Menon</p>
                <p className="text-xs text-muted-foreground">
                  Department of General Medicine · Consultation in progress
                </p>
              </div>

              {/* QUEUE STATUS PREVIEW */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>Upcoming in Queue</span>
                  <span>Est. Waiting Time</span>
                </div>

                {[
                  { token: "#05", name: "Aarav Patel", time: "~8 mins", status: "Next in line" },
                  { token: "#06", name: "Diya Rao", time: "~16 mins", status: "Checked in" },
                  {
                    token: "#07",
                    name: "Ishaan Gupta",
                    time: "~24 mins",
                    status: "Waiting in lounge",
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/80 bg-secondary/30 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-foreground">{item.token}</span>
                      <div>
                        <p className="font-semibold text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.status}</p>
                      </div>
                    </div>
                    <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      {item.time}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border">
                <span>
                  Clinic Desk Check-In: <strong>Open</strong>
                </span>
                <span className="text-primary font-medium">Real-Time Refresh Active</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOSPITAL STATS TELEMETRY */}
      <section id="telemetry" className="border-b border-border/60 bg-secondary/30 py-12">
        <div className="mx-auto max-w-7xl px-4 grid grid-cols-2 md:grid-cols-4 gap-6">
          {HOSPITAL_STATS.map((stat, i) => (
            <div key={i} className="space-y-1">
              <div className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
                {stat.value}
              </div>
              <div className="text-sm font-semibold text-primary">{stat.label}</div>
              <p className="text-xs text-muted-foreground">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOUR INTEGRATED WORKSPACES */}
      <section id="workspaces" className="py-20 border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              End-To-End Clinical Orchestration
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Four Interconnected Hospital Workspaces
            </h2>
            <p className="text-base text-muted-foreground">
              A single operational truth across patients, clinicians, receptionists, and
              administrators.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="surface-card p-6 space-y-4 border-t-4 border-t-emerald-500">
              <div className="size-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                <Users className="size-5" />
              </div>
              <h3 className="text-lg font-bold">Patient Portal</h3>
              <p className="text-sm text-muted-foreground">
                Find specialists by department, book guaranteed slots, track digital queue tokens,
                and access consultation history.
              </p>
              <div className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                Personalized Care &rarr;
              </div>
            </div>

            <div className="surface-card p-6 space-y-4 border-t-4 border-t-blue-500">
              <div className="size-10 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                <Stethoscope className="size-5" />
              </div>
              <h3 className="text-lg font-bold">Doctor Workspace</h3>
              <p className="text-sm text-muted-foreground">
                Review appointment requests, call next patient in queue, document symptoms,
                diagnoses, prescriptions, and follow-ups.
              </p>
              <div className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                Clinical Workflow &rarr;
              </div>
            </div>

            <div className="surface-card p-6 space-y-4 border-t-4 border-t-teal-500">
              <div className="size-10 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center font-bold">
                <Ticket className="size-5" />
              </div>
              <h3 className="text-lg font-bold">Reception Desk</h3>
              <p className="text-sm text-muted-foreground">
                Check in arriving patients, generate daily queue slips, monitor delayed patients,
                register walk-ins, and manage queue flow.
              </p>
              <div className="text-xs font-semibold text-teal-600 flex items-center gap-1">
                Lobby Operations &rarr;
              </div>
            </div>

            <div className="surface-card p-6 space-y-4 border-t-4 border-t-purple-500">
              <div className="size-10 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                <Building2 className="size-5" />
              </div>
              <h3 className="text-lg font-bold">Admin Console</h3>
              <p className="text-sm text-muted-foreground">
                Aggregated operational throughput KPIs, clinician performance reporting, staff
                access governance, and audit trails.
              </p>
              <div className="text-xs font-semibold text-purple-600 flex items-center gap-1">
                Executive Oversight &rarr;
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CLINICAL SPECIALTIES SHOWCASE */}
      <section id="departments" className="py-20 border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 space-y-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Multi-Specialty Care System
              </span>
              <h2 className="text-3xl font-bold tracking-tight text-foreground mt-1">
                Hospital Departments & Medical Wings
              </h2>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">View Doctor Directory &rarr;</Link>
            </Button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CLINICAL_DEPARTMENTS.map((dept, idx) => {
              const Icon = dept.icon;
              return (
                <div key={idx} className="surface-card p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="size-5" />
                    </span>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {dept.badge}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-foreground">{dept.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {dept.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-border bg-background py-10">
        <div className="mx-auto max-w-7xl px-4 flex flex-wrap items-center justify-between gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground font-bold text-xs">
              CF
            </span>
            <span className="font-semibold text-foreground">
              CareFlow Smart Healthcare Management Platform
            </span>
          </div>
          <div>Built with React 19, TypeScript, Express, MongoDB, Redis & Socket.IO</div>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="hover:text-foreground">
              Sign In
            </Link>
            <Link to="/auth" className="hover:text-foreground">
              Clinician Access
            </Link>
            <Link to="/auth" className="hover:text-foreground">
              Reception Desk
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
