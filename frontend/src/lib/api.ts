const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api").replace(
  /\/+$/,
  "",
);

export function getRealtimeBaseUrl(): string {
  return new URL(API_BASE_URL, window.location.origin).origin;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: "Female" | "Male" | "Other";
  bloodGroup?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
  address?: string;
}

export interface DoctorProfile {
  _id: string;
  userId: string | { _id: string; name: string };
  specialization: string;
  department?: string;
  qualification: string;
  experienceYears: number;
  licenseNumber?: string;
  consultationFee: number;
  bio?: string;
  isAvailable: boolean;
}

export interface DoctorProfileInput {
  specialization: string;
  department?: string;
  qualification: string;
  experienceYears: number;
  licenseNumber?: string;
  consultationFee: number;
  bio?: string;
  isAvailable: boolean;
}

export interface DoctorSchedule {
  _id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isAvailable: boolean;
}

export interface Appointment {
  _id: string;
  patientId: string | { _id: string; name: string; email?: string; phone?: string };
  doctorId:
    | string
    | {
        _id: string;
        specialization: string;
        qualification: string;
        userId: string | { _id: string; name: string };
      };
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason?: string;
  visitGoals?: string;
  symptoms?: string;
  allergies?: string;
  medications?: string;
  questions?: string;
  status: "scheduled" | "confirmed" | "rejected" | "completed" | "cancelled" | "no_show";
  rejectionReason?: string;
  auditTrail?: Array<{
    action: string;
    performedBy?: string | { _id: string; name: string };
    role?: string;
    timestamp: string;
    note?: string;
  }>;
}

export interface AppointmentSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface QueueEntry {
  _id: string;
  queueNumber: number;
  status: "waiting" | "called" | "in_consultation" | "completed" | "skipped" | "cancelled";
  doctorId?:
    | string
    | {
        specialization: string;
        userId: string | { _id: string; name: string };
      };
  checkedInAt?: string;
  calledAt?: string;
  completedAt?: string;
  skipReason?: string;
  peopleAhead?: number;
  estimatedWaitMinutes?: number | null;
  appointmentId:
    | string
    | {
        _id: string;
        appointmentDate: string;
        startTime: string;
        endTime: string;
        status: Appointment["status"];
      };
  patientId: string | { _id: string; name: string; email?: string; phone?: string };
}

export interface TodayQueue {
  _id: string;
  status: "open" | "closed";
  currentNumber: number;
  totalPatients: number;
}

export interface CareFlowNotification {
  _id: string;
  title: string;
  message: string;
  type: "appointment" | "queue" | "consultation" | "system";
  isRead: boolean;
  createdAt: string;
}

export interface MedicalRecord {
  _id: string;
  patientId: string | { _id: string; name: string };
  doctorId?:
    | string
    | {
        _id: string;
        specialization: string;
        userId: string | { _id: string; name: string };
      };
  title: string;
  description: string;
  recordedAt: string;
  createdAt: string;
}

export interface Consultation {
  _id: string;
  appointmentId: string | Appointment;
  patientId: string | { _id: string; name: string };
  doctorId:
    | string
    | { _id: string; specialization: string; userId: string | { _id: string; name: string } };
  symptoms?: string;
  diagnosis?: string;
  prescription?: string;
  notes?: string;
  followUpDate?: string;
  createdAt: string;
}

export interface CarePlanTask {
  _id: string;
  title: string;
  dueDate?: string;
  status: "pending" | "completed";
  completedAt?: string;
}

export interface CarePlanMedication {
  _id: string;
  name: string;
  dosage: string;
  schedule: string;
  instructions?: string;
  startDate: string;
  endDate?: string;
  takenDates: string[];
}

export interface CarePlan {
  _id: string;
  patientId: string | { _id: string; name: string };
  doctorId:
    | string
    | { _id: string; specialization: string; userId: string | { _id: string; name: string } };
  title: string;
  notes?: string;
  tasks: CarePlanTask[];
  medications: CarePlanMedication[];
  createdAt: string;
}

export interface InsightsData {
  total: number;
  completed: number;
  scheduled: number;
  byStatus: { name: Appointment["status"]; value: number }[];
  monthly: { month: string; count: number }[];
  bySpecialty: { name: string; count: number }[];
  recentAppointments: Appointment[];
  registeredDoctors?: number;
  registeredPatients?: number;
}

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface RegisterResponse {
  token?: string;
  user?: AuthUser;
  message?: string;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || data.error || "Something went wrong", response.status);
  }

  return data;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });
}

export async function loginWithGoogle(credential: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export async function register(
  name: string,
  email: string,
  password: string,
  role: "patient" | "doctor",
  specialty?: string,
): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      password,
      role,
      specialty,
    }),
  });
}

export async function getCurrentUser(): Promise<AuthUser> {
  const token = getToken();

  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await apiRequest<{ user: AuthUser }>("/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.user;
}

export async function updateCurrentUser(profile: {
  name?: string;
  phone?: string;
  dateOfBirth?: string | null;
  gender?: AuthUser["gender"] | null;
  bloodGroup?: AuthUser["bloodGroup"] | null;
  address?: string | null;
}): Promise<AuthUser> {
  const response = await apiRequest<{ user: AuthUser }>("/auth/me", {
    method: "PATCH",
    headers: authenticatedHeaders(),
    body: JSON.stringify(profile),
  });
  const token = getToken();
  if (token) saveAuth(token, response.user);
  return response.user;
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<string> {
  const response = await apiRequest<{ token: string }>("/auth/password", {
    method: "PATCH",
    headers: authenticatedHeaders(),
    body: JSON.stringify(input),
  });
  return response.token;
}

function authenticatedHeaders(): HeadersInit {
  const token = getToken();
  if (!token) {
    throw new ApiError("Please sign in to continue.", 401);
  }
  return { Authorization: `Bearer ${token}` };
}

export async function getDoctors(
  filters: {
    search?: string;
    specialization?: string;
    department?: string;
    availability?: boolean;
    sort?: "newest" | "name" | "experience" | "fee";
  } = {},
): Promise<DoctorProfile[]> {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.specialization) {
    params.set("specialization", filters.specialization);
  }
  if (filters.department) {
    params.set("department", filters.department);
  }
  if (filters.availability !== undefined) {
    params.set("availability", String(filters.availability));
  }
  if (filters.sort) params.set("sort", filters.sort);

  const query = params.size ? `?${params.toString()}` : "";
  const response = await apiRequest<{ doctors: DoctorProfile[] }>(`/doctors${query}`, {
    headers: authenticatedHeaders(),
  });
  return response.doctors;
}

export async function getDepartments(): Promise<string[]> {
  const response = await apiRequest<{ departments: string[] }>("/doctors/departments", {
    headers: authenticatedHeaders(),
  });
  return response.departments;
}

export async function getDoctor(id: string): Promise<DoctorProfile> {
  const response = await apiRequest<{ doctor: DoctorProfile }>(
    `/doctors/${encodeURIComponent(id)}`,
    { headers: authenticatedHeaders() },
  );
  return response.doctor;
}

export async function getMyDoctorProfile(): Promise<DoctorProfile> {
  const response = await apiRequest<{ doctor: DoctorProfile }>("/doctors/profile", {
    headers: authenticatedHeaders(),
  });
  return response.doctor;
}

export async function createDoctorProfile(profile: DoctorProfileInput): Promise<DoctorProfile> {
  const response = await apiRequest<{ doctor: DoctorProfile }>("/doctors/profile", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(profile),
  });
  return response.doctor;
}

export async function updateDoctorProfile(
  profile: Omit<DoctorProfileInput, "licenseNumber">,
): Promise<DoctorProfile> {
  const response = await apiRequest<{ doctor: DoctorProfile }>("/doctors/profile", {
    method: "PATCH",
    headers: authenticatedHeaders(),
    body: JSON.stringify(profile),
  });
  return response.doctor;
}

export async function getDoctorSlots(doctorId: string, date: string): Promise<AppointmentSlot[]> {
  const params = new URLSearchParams({ date });
  const response = await apiRequest<{ slots: AppointmentSlot[] }>(
    `/doctors/${encodeURIComponent(doctorId)}/slots?${params.toString()}`,
    { headers: authenticatedHeaders() },
  );
  return response.slots;
}

export async function getAppointments(): Promise<Appointment[]> {
  const response = await apiRequest<{ data: Appointment[] }>("/appointments", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function bookAppointment(input: {
  doctorId: string;
  appointmentDate: string;
  startTime: string;
  patientId?: string;
  reason?: string;
  visitGoals?: string;
  symptoms?: string;
  allergies?: string;
  medications?: string;
  questions?: string;
}): Promise<Appointment> {
  const response = await apiRequest<{ data: Appointment }>("/appointments", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  const response = await apiRequest<{ data: Appointment }>(
    `/appointments/${encodeURIComponent(id)}/cancel`,
    { method: "PATCH", headers: authenticatedHeaders() },
  );
  return response.data;
}

export async function rescheduleAppointment(
  id: string,
  input: { appointmentDate: string; startTime: string },
): Promise<Appointment> {
  const response = await apiRequest<{ data: Appointment }>(
    `/appointments/${encodeURIComponent(id)}/reschedule`,
    {
      method: "PATCH",
      headers: authenticatedHeaders(),
      body: JSON.stringify(input),
    },
  );
  return response.data;
}

export async function updateAppointmentStatus(
  id: string,
  status: "confirmed" | "rejected" | "completed",
  rejectionReason?: string,
): Promise<Appointment> {
  const response = await apiRequest<{ data: Appointment }>(
    `/appointments/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      headers: authenticatedHeaders(),
      body: JSON.stringify({ status, rejectionReason }),
    },
  );
  return response.data;
}

export async function getMyQueueEntries(): Promise<QueueEntry[]> {
  const response = await apiRequest<{ data: QueueEntry[] }>("/queue/mine", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function checkInToQueue(appointmentId: string): Promise<QueueEntry> {
  const response = await apiRequest<{ entry: QueueEntry }>("/queue/check-in", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify({ appointmentId }),
  });
  return response.entry;
}

export async function getTodayQueue(doctorId?: string): Promise<{
  queue: TodayQueue | null;
  entries: QueueEntry[];
}> {
  const params = new URLSearchParams();
  if (doctorId) params.set("doctorId", doctorId);
  const query = params.size ? `?${params.toString()}` : "";
  const response = await apiRequest<{
    queue: TodayQueue | null;
    entries: QueueEntry[];
  }>(`/queue/today${query}`, {
    headers: authenticatedHeaders(),
  });
  return response;
}

export async function callNextPatient(): Promise<QueueEntry> {
  const response = await apiRequest<{ entry: QueueEntry }>("/queue/call-next", {
    method: "POST",
    headers: authenticatedHeaders(),
  });
  return response.entry;
}

export async function startConsultationVisit(): Promise<QueueEntry> {
  const response = await apiRequest<{ entry: QueueEntry }>("/queue/start-visit", {
    method: "POST",
    headers: authenticatedHeaders(),
  });
  return response.entry;
}

export async function skipPatient(entryId?: string, skipReason?: string): Promise<QueueEntry> {
  const response = await apiRequest<{ entry: QueueEntry }>("/queue/skip", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify({ entryId, skipReason }),
  });
  return response.entry;
}

export async function requeuePatient(entryId: string): Promise<QueueEntry> {
  const response = await apiRequest<{ entry: QueueEntry }>("/queue/requeue", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify({ entryId }),
  });
  return response.entry;
}

export interface HospitalQueueDoctor {
  _id: string;
  specialization: string;
  department?: string;
  isAvailable: boolean;
  userId: { _id: string; name: string; email: string; phone?: string };
}

export interface HospitalQueueSessionData {
  session: {
    _id: string;
    doctorId: HospitalQueueDoctor;
    date: string;
    status: "open" | "closed";
    currentNumber: number;
    totalPatients: number;
  };
  metrics: {
    totalCheckedIn: number;
    waitingCount: number;
    completedCount: number;
    skippedCount: number;
  };
  calledEntry: QueueEntry | null;
  inConsultationEntry: QueueEntry | null;
  entries: QueueEntry[];
}

export async function getHospitalQueues(): Promise<HospitalQueueSessionData[]> {
  const response = await apiRequest<{ data: HospitalQueueSessionData[] }>("/queue/hospital", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function getMySchedules(): Promise<DoctorSchedule[]> {
  const response = await apiRequest<{ data: DoctorSchedule[] }>("/schedules/my", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function createSchedule(input: Omit<DoctorSchedule, "_id">): Promise<DoctorSchedule> {
  const response = await apiRequest<{ data: DoctorSchedule }>("/schedules", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await apiRequest(`/schedules/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authenticatedHeaders(),
  });
}

export async function getNotifications(): Promise<CareFlowNotification[]> {
  const response = await apiRequest<{ data: CareFlowNotification[] }>("/notifications", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    headers: authenticatedHeaders(),
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  await apiRequest("/notifications/read-all", {
    method: "PATCH",
    headers: authenticatedHeaders(),
  });
}

export async function getMedicalRecords(): Promise<MedicalRecord[]> {
  const response = await apiRequest<{ data: MedicalRecord[] }>("/medical-records", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function getConsultations(): Promise<Consultation[]> {
  const response = await apiRequest<{ data: Consultation[] }>("/consultations", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function createConsultation(input: {
  appointmentId: string;
  symptoms?: string;
  diagnosis: string;
  prescription?: string;
  notes?: string;
  followUpDate?: string;
}): Promise<Consultation> {
  const response = await apiRequest<{ consultation: Consultation }>("/consultations", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(input),
  });
  return response.consultation;
}

export async function createMedicalRecord(input: {
  patientId?: string;
  title: string;
  description: string;
  recordedAt: string;
}): Promise<MedicalRecord> {
  const response = await apiRequest<{ data: MedicalRecord }>("/medical-records", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function getCarePlans(): Promise<CarePlan[]> {
  const response = await apiRequest<{ data: CarePlan[] }>("/care-plans", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function createCarePlan(input: {
  patientId: string;
  title: string;
  notes?: string;
  tasks: { title: string; dueDate?: string }[];
  medications: {
    name: string;
    dosage: string;
    schedule: string;
    instructions?: string;
    startDate: string;
    endDate?: string;
  }[];
}): Promise<CarePlan> {
  const response = await apiRequest<{ data: CarePlan }>("/care-plans", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function updateCarePlanTask(
  carePlanId: string,
  taskId: string,
  status: CarePlanTask["status"],
): Promise<CarePlan> {
  const response = await apiRequest<{ data: CarePlan }>(
    `/care-plans/${encodeURIComponent(carePlanId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: "PATCH", headers: authenticatedHeaders(), body: JSON.stringify({ status }) },
  );
  return response.data;
}

export async function toggleMedicationTaken(
  carePlanId: string,
  medicationId: string,
): Promise<CarePlan> {
  const response = await apiRequest<{ data: CarePlan }>(
    `/care-plans/${encodeURIComponent(carePlanId)}/medications/${encodeURIComponent(medicationId)}/taken`,
    { method: "PATCH", headers: authenticatedHeaders() },
  );
  return response.data;
}

export async function getInsights(): Promise<InsightsData> {
  const response = await apiRequest<{ data: InsightsData }>("/insights", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function askAssistant(messages: AssistantMessage[]): Promise<string> {
  const response = await apiRequest<{ reply: string }>("/assistant", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify({ messages }),
  });
  return response.reply;
}

export interface StaffUser {
  _id: string;
  name: string;
  email: string;
  role: AuthUser["role"];
  isActive: boolean;
  createdAt: string;
  phone?: string;
  doctorProfile?: DoctorProfile | null;
}

export async function getStaffList(role?: string, search?: string): Promise<StaffUser[]> {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (search) params.set("search", search);
  const query = params.size ? `?${params.toString()}` : "";
  const response = await apiRequest<{ data: StaffUser[] }>(`/admin/staff${query}`, {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export async function updateStaffStatus(
  id: string,
  isActive: boolean,
): Promise<{
  message: string;
  user: { id: string; name: string; email: string; role: AuthUser["role"]; isActive: boolean };
}> {
  return apiRequest(`/admin/staff/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: authenticatedHeaders(),
    body: JSON.stringify({ isActive }),
  });
}

export interface CreateStaffInput {
  name: string;
  email: string;
  password: string;
  role: "doctor" | "receptionist" | "patient";
  phone?: string;
  specialization?: string;
  department?: string;
  qualification?: string;
  experienceYears?: number;
  licenseNumber?: string;
  consultationFee?: number;
  bio?: string;
}

export async function createStaffMember(input: CreateStaffInput): Promise<{
  message: string;
  user: { id: string; name: string; email: string; role: AuthUser["role"]; isActive: boolean };
}> {
  return apiRequest("/admin/staff", {
    method: "POST",
    headers: authenticatedHeaders(),
    body: JSON.stringify(input),
  });
}

export interface OperationalReportSummary {
  totalAppointments: number;
  completedCount: number;
  cancelledCount: number;
  scheduledCount: number;
  confirmedCount: number;
  rejectedCount: number;
  completionRate: number;
  cancellationRate: number;
  registeredDoctors: number;
  registeredPatients: number;
  registeredReceptionists: number;
}

export interface OperationalReportsData {
  dateRange: { start: string; end: string };
  summary: OperationalReportSummary;
  doctorPerformance: Array<{
    doctorId: string;
    name: string;
    specialization: string;
    department: string;
    total: number;
    completed: number;
    cancelled: number;
  }>;
  departmentBreakdown: Array<{
    _id: string;
    count: number;
    completed: number;
  }>;
  queueBreakdown: Array<{ status: string; count: number }>;
}

export async function getOperationalReports(
  startDate?: string,
  endDate?: string,
): Promise<OperationalReportsData> {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const query = params.size ? `?${params.toString()}` : "";
  const response = await apiRequest<{ data: OperationalReportsData }>(`/admin/reports${query}`, {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export interface AuditLogEntry {
  id: string;
  appointmentId: string;
  action: string;
  role: string;
  timestamp: string;
  note?: string;
  patientName: string;
  doctorName: string;
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  const response = await apiRequest<{ data: AuditLogEntry[] }>("/admin/audit-logs", {
    headers: authenticatedHeaders(),
  });
  return response.data;
}

export function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem("careflow_token", token);
  localStorage.setItem("careflow_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("careflow_token");
  localStorage.removeItem("careflow_user");
}

export function getSavedUser(): AuthUser | null {
  const user = localStorage.getItem("careflow_user");

  if (!user) {
    return null;
  }

  try {
    return JSON.parse(user) as AuthUser;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return localStorage.getItem("careflow_token");
}
