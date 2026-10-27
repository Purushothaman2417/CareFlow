import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  getNotifications,
  getSavedUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — CareFlow" },
      {
        name: "description",
        content: "Appointment updates and messages from your CareFlow care team.",
      },
      { property: "og:title", content: "Notifications — CareFlow" },
      { property: "og:description", content: "Your appointment updates in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationsPage() {
  const user = getSavedUser();
  const queryClient = useQueryClient();
  const queryKey = ["notifications", user?.id];
  const notificationsQuery = useQuery({
    queryKey,
    queryFn: getNotifications,
    enabled: !!user,
  });
  const markReadMutation = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not update the notification."),
  });
  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success("All notifications marked as read.");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not update notifications."),
  });
  const notifications = notificationsQuery.data ?? [];
  const hasUnread = notifications.some((notification) => !notification.isRead);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">Notifications</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllMutation.mutate()}
          disabled={!hasUnread || markAllMutation.isPending}
        >
          {markAllMutation.isPending ? "Updating…" : "Mark all read"}
        </Button>
      </div>

      {notificationsQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : notificationsQuery.isError ? (
        <div className="surface-card space-y-3 p-8 text-center">
          <p className="text-sm text-destructive" role="alert">
            Notifications could not be loaded.
          </p>
          <Button variant="outline" onClick={() => void notificationsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 p-10 text-muted-foreground">
          <Bell className="size-8" /> Nothing yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => (
            <li
              key={notification._id}
              className={`surface-card p-4 ${
                notification.isRead ? "opacity-70" : "border-l-4 border-l-primary"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{notification.title}</p>
                  {notification.message ? (
                    <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                  ) : null}
                </div>
                <time
                  className="shrink-0 text-xs text-muted-foreground"
                  dateTime={notification.createdAt}
                >
                  {formatDate(notification.createdAt)}
                </time>
              </div>
              {!notification.isRead ? (
                <Button
                  className="mt-3"
                  variant="ghost"
                  size="sm"
                  onClick={() => markReadMutation.mutate(notification._id)}
                  disabled={markReadMutation.isPending}
                >
                  Mark read
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
