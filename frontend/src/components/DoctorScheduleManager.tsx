import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ApiError,
  createSchedule,
  deleteSchedule,
  getMySchedules,
  type DoctorSchedule,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EMPTY_SCHEDULE = {
  dayOfWeek: "1",
  startTime: "09:00",
  endTime: "17:00",
  slotDuration: "30",
  isAvailable: true,
};

function messageFor(error: unknown) {
  return error instanceof ApiError ? error.message : "Please try again.";
}

export function DoctorScheduleManager({ profileExists }: { profileExists: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_SCHEDULE);
  const schedulesQuery = useQuery({
    queryKey: ["doctor-schedules"],
    queryFn: getMySchedules,
    enabled: profileExists,
  });

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["doctor-schedules"] });
      setForm(EMPTY_SCHEDULE);
      toast.success("Availability added.");
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["doctor-schedules"] });
      toast.success("Availability removed.");
    },
    onError: (error) => toast.error(messageFor(error)),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
      slotDuration: Number(form.slotDuration),
      isAvailable: true,
    });
  }

  return (
    <section className="surface-card space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold">Appointment availability</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set weekly clinic hours. Existing appointments prevent conflicting schedule changes.
        </p>
      </div>

      {!profileExists ? (
        <p className="text-sm text-muted-foreground">
          Save your doctor profile before adding availability.
        </p>
      ) : (
        <>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-weekday">Day</Label>
              <select
                id="schedule-weekday"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.dayOfWeek}
                onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}
              >
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-start">Start</Label>
              <Input
                id="schedule-start"
                type="time"
                value={form.startTime}
                onChange={(event) => setForm({ ...form, startTime: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-end">End</Label>
              <Input
                id="schedule-end"
                type="time"
                value={form.endTime}
                onChange={(event) => setForm({ ...form, endTime: event.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-duration">Slot (minutes)</Label>
              <Input
                id="schedule-duration"
                type="number"
                min={5}
                max={120}
                step={5}
                value={form.slotDuration}
                onChange={(event) => setForm({ ...form, slotDuration: event.target.value })}
                required
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending || !profileExists}
              >
                Add hours
              </Button>
            </div>
          </form>

          {schedulesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading availability…</p>
          ) : schedulesQuery.isError ? (
            <div className="flex items-center gap-3 text-sm" role="alert">
              <span className="text-destructive">Availability could not be loaded.</span>
              <Button variant="outline" size="sm" onClick={() => void schedulesQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : schedulesQuery.data?.length ? (
            <ul className="divide-y divide-border">
              {schedulesQuery.data.map((schedule: DoctorSchedule) => (
                <li key={schedule._id} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm">
                    <span className="font-medium">{WEEKDAYS[schedule.dayOfWeek]}</span>
                    {" · "}
                    {schedule.startTime}–{schedule.endTime}
                    {" · "}
                    {schedule.slotDuration}-minute visits
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(schedule._id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No weekly availability added yet.</p>
          )}
        </>
      )}
    </section>
  );
}
