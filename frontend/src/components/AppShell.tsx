import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearAuth, getNotifications, getSavedUser, getToken } from "@/lib/api";
import { connectRealtime } from "@/lib/realtime";

const allLinks = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["patient", "doctor"] },
  {
    to: "/reception",
    label: "Reception Desk",
    icon: ClipboardCheck,
    roles: ["receptionist", "admin"],
  },
  { to: "/admin", label: "Admin Console", icon: ShieldCheck, roles: ["admin"] },
  {
    to: "/doctors",
    label: "Doctor Directory",
    icon: Stethoscope,
    roles: ["patient", "admin", "receptionist"],
  },
  {
    to: "/appointments",
    label: "Appointments",
    icon: CalendarDays,
    roles: ["patient", "doctor", "receptionist", "admin"],
  },
  { to: "/patients", label: "My Patients", icon: Users, roles: ["doctor", "receptionist"] },
  { to: "/records", label: "Medical Records", icon: FileText, roles: ["patient", "doctor"] },
  { to: "/assistant", label: "Care Assistant", icon: Bot, roles: ["patient"] },
  { to: "/insights", label: "Analytics", icon: BarChart3, roles: ["doctor", "admin"] },
  {
    to: "/profile",
    label: "Profile",
    icon: UserRound,
    roles: ["patient", "doctor", "receptionist", "admin"],
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const user = getSavedUser();
  const userId = user?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = user?.role ?? "patient";
  const links = allLinks.filter((l) => (l.roles as readonly string[]).includes(role));
  const unreadQuery = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: getNotifications,
  });
  const unread = unreadQuery.data?.filter((notification) => !notification.isRead).length ?? 0;

  useEffect(() => {
    const token = getToken();
    if (!userId || !token) return;

    return connectRealtime(token, {
      onQueueUpdate: () => {
        void queryClient.invalidateQueries({ queryKey: ["my-queue"] });
        void queryClient.invalidateQueries({ queryKey: ["today-queue"] });
        void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      },
      onNotification: () => {
        void queryClient.invalidateQueries({
          queryKey: ["notifications", userId],
        });
      },
    });
  }, [queryClient, userId]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearAuth();
    navigate({ to: "/auth", replace: true });
  }

  const roleBadgeStyle =
    role === "doctor"
      ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
      : role === "admin"
        ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"
        : role === "receptionist"
          ? "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";

  const userInitials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "CF";

  return (
    <div className="min-h-screen bg-background">
      {/* REALISTIC HOSPITAL SYSTEM TOP BANNER */}
      <div className="border-b border-border/60 bg-secondary/40 px-4 py-1 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="size-3.5 text-primary" />
            <span className="font-medium text-foreground">CareFlow Health System</span>
            <span className="hidden sm:inline opacity-60">
              · Main Campus & Clinical Outpatient Pavilion
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:inline">
              Emergency Helpline: <strong>108 / 080-2440-1000</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Clinical Node
            </span>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky-600 shadow-sm transition-transform group-hover:scale-105">
              <HeartPulse className="size-5 text-white" />
            </span>
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold tracking-tight text-foreground leading-none">
                CareFlow
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Hospital OS
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {links.map(({ to, label, icon: Icon }) => {
              const active = pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link
              to="/notifications"
              className="relative rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground animate-in zoom-in">
                  {unread}
                </span>
              ) : null}
            </Link>

            {user ? (
              <div className="hidden items-center gap-3 border-l border-border/60 pl-3 sm:flex">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {userInitials}
                </span>
                <div className="text-right">
                  <p className="text-xs font-bold leading-tight text-foreground">{user.name}</p>
                  <span
                    className={cn(
                      "inline-block rounded-full border px-2 py-0.2 text-[10px] font-semibold capitalize leading-tight",
                      roleBadgeStyle,
                    )}
                  >
                    {user.role}
                  </span>
                </div>
              </div>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>

        {/* MOBILE NAVIGATION BAR */}
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 lg:hidden">
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors",
                pathname === to && "bg-primary text-primary-foreground font-semibold shadow-sm",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {import.meta.env.DEV ? (
        <aside
          className="border-b border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40 px-4 py-1.5 text-center text-xs font-medium text-sky-900 dark:text-sky-200"
          role="note"
        >
          CareFlow Clinical Academic & Demonstration Node — Real-time appointment synchronization
          and live telemetry active.
        </aside>
      ) : null}

      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
