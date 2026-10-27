import type { IDoctorSchedule } from "../models/DoctorSchedule";

export const CLINIC_TIME_ZONE =
  process.env.CAREFLOW_TIME_ZONE || "Asia/Kolkata";

export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function clinicDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function clinicTimeInMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLINIC_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((item) => item.type === "hour")?.value);
  const minute = Number(parts.find((item) => item.type === "minute")?.value);

  return hour * 60 + minute;
}

export function timeInMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

export function isPastSlot(
  date: string,
  startTime: string,
  now = new Date(),
): boolean {
  const today = clinicDateKey(now);
  if (date < today) return true;
  return date === today && timeInMinutes(startTime) <= clinicTimeInMinutes(now);
}

export function scheduleContainsSlot(
  schedule: Pick<IDoctorSchedule, "startTime" | "endTime" | "slotDuration">,
  startTime: string,
  endTime: string,
): boolean {
  const start = timeInMinutes(startTime);
  const end = timeInMinutes(endTime);
  const scheduleStart = timeInMinutes(schedule.startTime);
  const scheduleEnd = timeInMinutes(schedule.endTime);

  return (
    start >= scheduleStart &&
    end <= scheduleEnd &&
    end - start === schedule.slotDuration &&
    (start - scheduleStart) % schedule.slotDuration === 0
  );
}

export function schedulesOverlap(
  first: Pick<IDoctorSchedule, "startTime" | "endTime">,
  second: Pick<IDoctorSchedule, "startTime" | "endTime">,
): boolean {
  return (
    timeInMinutes(first.startTime) < timeInMinutes(second.endTime) &&
    timeInMinutes(second.startTime) < timeInMinutes(first.endTime)
  );
}
