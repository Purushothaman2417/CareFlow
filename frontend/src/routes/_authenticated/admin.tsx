import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

import {
  ApiError,
  createStaffMember,
  getAuditLogs,
  getDepartments,
  getOperationalReports,
  getSavedUser,
  getStaffList,
  updateStaffStatus,
  type AuditLogEntry,
  type StaffUser,
} from "@/lib/api";
import { SPECIALTIES } from "@/lib/specialties";
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

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — CareFlow" },
      {
        name: "description",
        content: "Hospital operational intelligence, staff administration and audit governance.",
      },
    ],
  }),
  component: AdminConsolePage,
});

function AdminConsolePage() {
  const user = getSavedUser();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  const [activeTab, setActiveTab] = useState<"operations" | "staff" | "audit">("operations");
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  // Staff directory state
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [isNewStaffOpen, setIsNewStaffOpen] = useState(false);

  // New staff form state
  const [newRole, setNewRole] = useState<"doctor" | "receptionist" | "patient">("doctor");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("Hospital@2026");
  const [newPhone, setNewPhone] = useState("");
  const [newSpecialization, setNewSpecialization] = useState<string>(SPECIALTIES[0]);
  const [newDepartment, setNewDepartment] = useState("General Medicine");
  const [newQualification, setNewQualification] = useState("MBBS, MD");
  const [newFee, setNewFee] = useState("500");
  const [newExperience, setNewExperience] = useState("5");

  // Audit search state
  const [auditSearch, setAuditSearch] = useState("");

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: getDepartments,
    enabled: isAdmin,
  });

  const reportsQuery = useQuery({
    queryKey: ["admin-reports", dateRange],
    queryFn: () => {
      let startDate: string | undefined;
      const now = new Date();
      if (dateRange === "7d") {
        startDate = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      } else if (dateRange === "30d") {
        startDate = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      } else if (dateRange === "90d") {
        startDate = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
      }
      return getOperationalReports(startDate);
    },
    enabled: isAdmin,
  });

  const staffQuery = useQuery({
    queryKey: ["admin-staff", staffRoleFilter, staffSearch],
    queryFn: () =>
      getStaffList(
        staffRoleFilter !== "all" ? staffRoleFilter : undefined,
        staffSearch.trim() || undefined,
      ),
    enabled: isAdmin,
  });

  const auditQuery = useQuery({
    queryKey: ["admin-audit"],
    queryFn: getAuditLogs,
    enabled: isAdmin,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      updateStaffStatus(userId, isActive),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.success(
        `User ${updated.user.name} ${updated.user.isActive ? "activated" : "deactivated"}.`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to update staff status.");
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: () => {
      const input = {
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
        ...(newRole === "doctor"
          ? {
              specialization: newSpecialization,
              department: newDepartment,
              qualification: newQualification,
              consultationFee: Number(newFee),
              experienceYears: Number(newExperience),
            }
          : {}),
      };
      return createStaffMember(input);
    },
    onSuccess: (res) => {
      setIsNewStaffOpen(false);
      resetNewStaffForm();
      void queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      void queryClient.invalidateQueries({ queryKey: ["doctors"] });
      toast.success(`${newRole.toUpperCase()} account created successfully!`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Failed to create staff member.");
    },
  });

  function resetNewStaffForm() {
    setNewName("");
    setNewEmail("");
    setNewPassword("Hospital@2026");
    setNewPhone("");
    setNewSpecialization(SPECIALTIES[0]);
    setNewDepartment("General Medicine");
    setNewQualification("MBBS, MD");
    setNewFee("500");
    setNewExperience("5");
  }

  if (!isAdmin) {
    return (
      <div className="surface-card space-y-3 p-8 text-center">
        <ShieldAlert className="size-10 text-destructive mx-auto" />
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="text-sm text-muted-foreground">
          You do not have administrative privileges to view the hospital operations console.
        </p>
      </div>
    );
  }

  const reports = reportsQuery.data;
  const staff = staffQuery.data ?? [];
  const auditLogs = auditQuery.data ?? [];

  const filteredAuditLogs = auditLogs.filter((log) => {
    const q = auditSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      log.action.toLowerCase().includes(q) ||
      log.role.toLowerCase().includes(q) ||
      log.patientName.toLowerCase().includes(q) ||
      log.doctorName.toLowerCase().includes(q) ||
      (log.note && log.note.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Hospital Operations Console</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Executive oversight, real operational metrics, staff role access, and audit log
            compliance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setIsNewStaffOpen(true)} className="gap-1.5 shadow-sm">
            <UserPlus className="size-4" />
            Add Staff Member
          </Button>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "operations" | "staff" | "audit")}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="operations" className="flex items-center gap-2">
            <TrendingUp className="size-4" />
            Operations Intelligence
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <Users className="size-4" />
            Staff & Access ({staff.length})
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Activity className="size-4" />
            Audit Trail ({auditLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OPERATIONAL INTELLIGENCE */}
        <TabsContent value="operations" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="size-4" />
              <span>Reporting Timeframe:</span>
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-secondary/50">
                {(["7d", "30d", "90d", "all"] as const).map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => setDateRange(range)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      dateRange === range
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {range === "7d"
                      ? "Last 7 Days"
                      : range === "30d"
                        ? "Last 30 Days"
                        : range === "90d"
                          ? "Last Quarter"
                          : "All Time"}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Real-time aggregation from stored MongoDB clinical operational collections
            </div>
          </div>

          {reportsQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          ) : reports ? (
            <>
              {/* METRIC CARDS */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="surface-card p-5 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Total Bookings
                  </span>
                  <div className="text-3xl font-black">{reports.summary.totalAppointments}</div>
                  <p className="text-xs text-muted-foreground">In selected date timeframe</p>
                </div>

                <div className="surface-card p-5 space-y-2 border-l-4 border-l-emerald-500">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Completed Consultations
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-emerald-600">
                      {reports.summary.completedCount}
                    </span>
                    <span className="text-sm font-semibold text-emerald-600">
                      ({reports.summary.completionRate}%)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Successful clinical discharges</p>
                </div>

                <div className="surface-card p-5 space-y-2 border-l-4 border-l-amber-500">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cancellation / No-Show
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-amber-600">
                      {reports.summary.cancelledCount}
                    </span>
                    <span className="text-sm font-semibold text-amber-600">
                      ({reports.summary.cancellationRate}%)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Appointments revoked or missed</p>
                </div>

                <div className="surface-card p-5 space-y-2 border-l-4 border-l-primary">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Active Hospital Staff
                  </span>
                  <div className="text-3xl font-black text-primary">
                    {reports.summary.registeredDoctors + reports.summary.registeredReceptionists}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {reports.summary.registeredDoctors} doctors ·{" "}
                    {reports.summary.registeredReceptionists} receptionists ·{" "}
                    {reports.summary.registeredPatients} patients
                  </p>
                </div>
              </div>

              {/* DOCTOR PERFORMANCE THROUGHPUT */}
              <div className="surface-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Clinician Consultation Throughput</h2>
                    <p className="text-xs text-muted-foreground">
                      Operational breakdown by individual doctor in selected range
                    </p>
                  </div>
                </div>

                {reports.doctorPerformance.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No doctor appointment throughput recorded in this period.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground uppercase">
                          <th className="pb-3 font-semibold">Doctor Name</th>
                          <th className="pb-3 font-semibold">Specialization</th>
                          <th className="pb-3 font-semibold text-center">Completed</th>
                          <th className="pb-3 font-semibold text-center">Cancelled</th>
                          <th className="pb-3 font-semibold text-right">Total Visits</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {reports.doctorPerformance.map((doc) => (
                          <tr
                            key={doc.doctorId}
                            className="hover:bg-secondary/40 transition-colors"
                          >
                            <td className="py-3 font-medium">{doc.name}</td>
                            <td className="py-3 text-muted-foreground">{doc.specialization}</td>
                            <td className="py-3 text-center font-bold text-emerald-600">
                              {doc.completed}
                            </td>
                            <td className="py-3 text-center text-destructive">{doc.cancelled}</td>
                            <td className="py-3 text-right font-black">{doc.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="surface-card p-8 text-center text-destructive">
              Could not load operational reports.
            </div>
          )}
        </TabsContent>

        {/* TAB 2: STAFF & ACCESS MANAGEMENT */}
        <TabsContent value="staff" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search staff by name or email…"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <select
                aria-label="Filter role"
                value={staffRoleFilter}
                onChange={(e) => setStaffRoleFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="all">All Roles</option>
                <option value="doctor">Doctors</option>
                <option value="receptionist">Receptionists</option>
                <option value="patient">Patients</option>
                <option value="admin">Administrators</option>
              </select>
            </div>

            <Button size="sm" onClick={() => setIsNewStaffOpen(true)} className="gap-1.5">
              <Plus className="size-4" />
              New Member
            </Button>
          </div>

          {staffQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : staff.length === 0 ? (
            <div className="surface-card p-10 text-center text-sm text-muted-foreground">
              No staff members found matching criteria.
            </div>
          ) : (
            <div className="surface-card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-xs text-muted-foreground uppercase">
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Department / Details</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {staff.map((member) => (
                    <tr key={member._id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                            member.role === "doctor"
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                              : member.role === "admin"
                                ? "bg-purple-500/10 text-purple-700 dark:text-purple-400"
                                : member.role === "receptionist"
                                  ? "bg-teal-500/10 text-teal-700 dark:text-teal-400"
                                  : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {member.doctorProfile ? (
                          <div>
                            <span className="font-medium text-foreground">
                              {member.doctorProfile.department || "Clinical"}
                            </span>{" "}
                            · {member.doctorProfile.specialization} (Fee: ₹
                            {member.doctorProfile.consultationFee})
                          </div>
                        ) : member.phone ? (
                          <span>Phone: {member.phone}</span>
                        ) : (
                          <span>Standard User</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            member.isActive
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              member.isActive ? "bg-emerald-500" : "bg-destructive"
                            }`}
                          />
                          {member.isActive ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {member._id !== user?.id ? (
                          <Button
                            size="sm"
                            variant={member.isActive ? "outline" : "default"}
                            className="h-7 text-xs"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                userId: member._id,
                                isActive: !member.isActive,
                              })
                            }
                            disabled={updateStatusMutation.isPending}
                          >
                            {member.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">You</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* TAB 3: AUDIT TRAIL */}
        <TabsContent value="audit" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative min-w-[280px] max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search audit trail by actor, action or resource…"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Immutable security and operational event trail
            </div>
          </div>

          {auditQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredAuditLogs.length === 0 ? (
            <div className="surface-card p-10 text-center text-sm text-muted-foreground">
              No audit logs found matching criteria.
            </div>
          ) : (
            <div className="surface-card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-xs text-muted-foreground uppercase">
                    <th className="px-4 py-3 font-semibold">Timestamp</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                    <th className="px-4 py-3 font-semibold">Actor</th>
                    <th className="px-4 py-3 font-semibold">Target Resource</th>
                    <th className="px-4 py-3 font-semibold">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-xs font-mono uppercase bg-secondary px-2 py-0.5 rounded">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="font-medium text-foreground capitalize">{log.role}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        Appointment: {log.appointmentId.slice(-6)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {log.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* NEW STAFF MEMBER DIALOG */}
      <Dialog open={isNewStaffOpen} onOpenChange={setIsNewStaffOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Hospital Staff Member</DialogTitle>
            <DialogDescription>
              Register a new doctor, receptionist, or patient with appropriate system roles.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              createStaffMutation.mutate();
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-1.5">
              <Label>Select Role</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["doctor", "receptionist", "patient"] as const).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={newRole === r ? "default" : "outline"}
                    className="capitalize text-xs h-9"
                    onClick={() => setNewRole(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="staff-name">Full Name</Label>
                <Input
                  id="staff-name"
                  required
                  placeholder="e.g. Dr. Ananya Sharma"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-email">Email Address</Label>
                <Input
                  id="staff-email"
                  type="email"
                  required
                  placeholder="e.g. ananya@careflow.org"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="staff-pwd">Initial Password</Label>
                <Input
                  id="staff-pwd"
                  required
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-phone">Phone Number</Label>
                <Input
                  id="staff-phone"
                  placeholder="e.g. +91 98765 00000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
            </div>

            {/* DOCTOR SPECIFIC FIELDS */}
            {newRole === "doctor" ? (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Doctor Clinical Profile
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-dept">Department</Label>
                    <Input
                      id="doc-dept"
                      required
                      placeholder="e.g. Cardiology"
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="doc-spec">Specialization</Label>
                    <select
                      id="doc-spec"
                      value={newSpecialization}
                      onChange={(e) => setNewSpecialization(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      {SPECIALTIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="doc-qual">Qualification</Label>
                    <Input
                      id="doc-qual"
                      required
                      placeholder="MBBS, MD"
                      value={newQualification}
                      onChange={(e) => setNewQualification(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="doc-fee">Fee (₹)</Label>
                    <Input
                      id="doc-fee"
                      type="number"
                      min={0}
                      required
                      value={newFee}
                      onChange={(e) => setNewFee(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="doc-exp">Exp (Years)</Label>
                    <Input
                      id="doc-exp"
                      type="number"
                      min={0}
                      required
                      value={newExperience}
                      onChange={(e) => setNewExperience(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsNewStaffOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createStaffMutation.isPending}>
                {createStaffMutation.isPending ? "Creating..." : "Create Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
