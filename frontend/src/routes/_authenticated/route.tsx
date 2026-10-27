import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ApiError, clearAuth, getCurrentUser, getToken, saveAuth } from "@/lib/api";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const token = getToken();
    if (!token) throw redirect({ to: "/auth" });

    try {
      const user = await getCurrentUser();
      saveAuth(token, user);
      return { user };
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        clearAuth();
        throw redirect({ to: "/auth" });
      }

      throw error;
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
