import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  HeartPulse,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Stethoscope,
  Ticket,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { getToken, login, loginWithGoogle, register, saveAuth } from "@/lib/api";
import { SPECIALTIES } from "@/lib/specialties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: { theme: "outline"; size: "large"; text: "continue_with"; width: number },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const GOOGLE_CLIENT_ID = import.meta.env["VITE_GOOGLE_CLIENT_ID"]?.trim();

const DEMO_PERSONAS = [
  {
    role: "Doctor",
    name: "Dr. Asha Menon",
    email: "demo.doctor.01@careflow.test",
    desc: "General Medicine",
    icon: Stethoscope,
    badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  {
    role: "Patient",
    name: "Aarav Patel",
    email: "demo.patient.01@careflow.test",
    desc: "Active Outpatient",
    icon: Users,
    badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
  {
    role: "Receptionist",
    name: "Front Desk Staff",
    email: "demo.reception@careflow.test",
    desc: "Lobby & Queue Desk",
    icon: Ticket,
    badgeColor: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
  },
  {
    role: "Administrator",
    name: "Hospital Director",
    email: "demo.admin@careflow.test",
    desc: "Executive Console",
    icon: Building2,
    badgeColor: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  },
] as const;

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — CareFlow Hospital OS" },
      {
        name: "description",
        content: "Secure clinical access portal for patients, clinicians, and hospital staff.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"patient" | "doctor">("patient");
  const [specialty, setSpecialty] = useState<string>("General Medicine");

  // Check whether the user is already logged in
  useEffect(() => {
    const token = getToken();
    if (token) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await login(email, password);
      saveAuth(response.token, response.user);
      toast.success(`Welcome back, ${response.user.name}!`);

      if (response.user.role === "receptionist") {
        navigate({ to: "/reception", replace: true });
      } else if (response.user.role === "admin") {
        navigate({ to: "/admin", replace: true });
      } else {
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await register(
        fullName,
        email,
        password,
        role,
        role === "doctor" ? specialty : undefined,
      );

      if (response.token && response.user) {
        saveAuth(response.token, response.user);
        toast.success(`Account registered! Welcome to CareFlow, ${response.user.name}.`);
        navigate({ to: "/dashboard", replace: true });
      } else {
        toast.success("Account created successfully. Please sign in.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setLoading(true);
      try {
        const response = await loginWithGoogle(credential);
        saveAuth(response.token, response.user);
        toast.success("Signed in with Google.");
        await navigate({ to: "/dashboard", replace: true });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Google sign-in could not be completed.",
        );
      } finally {
        setLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    const container = googleButtonRef.current;
    if (!GOOGLE_CLIENT_ID || !container) return;

    let cancelled = false;
    const initializeGoogleSignIn = () => {
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (!response.credential) {
            toast.error("Google did not return a sign-in credential.");
            return;
          }
          void handleGoogleCredential(response.credential);
        },
      });
      window.google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        width: Math.min(350, container.clientWidth || 350),
      });
    };

    if (window.google) {
      initializeGoogleSignIn();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => initializeGoogleSignIn();
      document.body.appendChild(script);
      return () => {
        cancelled = true;
        if (script.parentNode) script.parentNode.removeChild(script);
      };
    }
  }, [handleGoogleCredential]);

  function fillDemoPersona(persona: (typeof DEMO_PERSONAS)[number]) {
    setEmail(persona.email);
    setPassword("purushoth123");
    toast.info(`Filled credentials for ${persona.name} (${persona.role})`);
  }

  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-12 selection:bg-primary/20 selection:text-primary">
      {/* LEFT COLUMN: REALISTIC HOSPITAL BRAND & DEMO CREDENTIALS */}
      <div className="hidden lg:flex lg:col-span-5 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 text-white p-10 flex-col justify-between border-r border-slate-800 relative overflow-hidden">
        <div className="space-y-6 relative z-10">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-600 shadow-md">
              <HeartPulse className="size-6 text-white" />
            </span>
            <div className="flex flex-col">
              <span className="font-display text-2xl font-bold tracking-tight text-white leading-none">
                CareFlow
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">
                Hospital OS
              </span>
            </div>
          </Link>

          <div className="pt-6 space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
              <ShieldCheck className="size-3.5 text-blue-400" />
              Role-Based Medical Access
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-white leading-snug">
              Secure Hospital Gateway
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              CareFlow enforces strict role separation between patient health portals, clinician
              workspaces, reception check-in desks, and executive administration.
            </p>
          </div>

          {/* ONE-CLICK DEMO PERSONAS FOR EFFORTLESS EVALUATION */}
          <div className="pt-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Instant Demo Access (Click to populate)
            </p>
            <div className="grid gap-2">
              {DEMO_PERSONAS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.role}
                    type="button"
                    onClick={() => fillDemoPersona(p)}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-blue-500/50 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-md bg-slate-800 group-hover:bg-blue-600/30 text-blue-400">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-white leading-tight">{p.name}</p>
                        <p className="text-[11px] text-slate-400">{p.desc}</p>
                      </div>
                    </div>
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-slate-700 bg-slate-800 text-slate-300">
                      {p.role}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Default demo password: <code className="text-blue-300">purushoth123</code>
            </p>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800/80 text-xs text-slate-400 space-y-1 relative z-10">
          <p className="flex items-center gap-2 text-emerald-400 font-medium">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            256-Bit Encrypted Healthcare Session
          </p>
          <p>CareFlow Central Teaching Hospital System &copy; 2026</p>
        </div>
      </div>

      {/* RIGHT COLUMN: AUTHENTICATION FORM */}
      <div className="lg:col-span-7 flex flex-col justify-center px-4 py-12 sm:px-8 lg:px-16 max-w-xl mx-auto w-full">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Sign In to CareFlow
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your registered clinical credentials or select a persona from the left panel.
            </p>
          </div>

          <Tabs defaultValue="signin" className="space-y-6">
            <TabsList className="grid grid-cols-2 w-full max-w-sm">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register Account</TabsTrigger>
            </TabsList>

            {/* SIGN IN TAB */}
            <TabsContent value="signin" className="space-y-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email">Email Address</Label>
                  <div className="relative">
                    <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-email"
                      type="email"
                      required
                      placeholder="doctor@careflow.test or patient@careflow.test"
                      className="pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-pass">Password</Label>
                    <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                      Forgot password?
                    </span>
                  </div>
                  <div className="relative">
                    <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="auth-pass"
                      type="password"
                      required
                      placeholder="••••••••••••"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 gap-2 font-semibold"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  {loading ? "Authenticating…" : "Sign In to Portal"}
                </Button>
              </form>
            </TabsContent>

            {/* REGISTER TAB */}
            <TabsContent value="register" className="space-y-4">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Full Name</Label>
                  <div className="relative">
                    <User className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="reg-name"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      className="pl-9"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">Email Address</Label>
                  <div className="relative">
                    <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="reg-email"
                      type="email"
                      required
                      placeholder="ramesh@example.com"
                      className="pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-pass">Password (min. 6 characters)</Label>
                  <div className="relative">
                    <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="reg-pass"
                      type="password"
                      required
                      minLength={6}
                      placeholder="••••••••••••"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Registering As</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as "patient" | "doctor")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="patient">Patient (Booking & Records)</SelectItem>
                      <SelectItem value="doctor">Medical Doctor / Clinician</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {role === "doctor" ? (
                  <div className="space-y-1.5">
                    <Label>Primary Medical Specialty</Label>
                    <Select value={specialty} onValueChange={setSpecialty}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SPECIALTIES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  className="w-full h-10 gap-2 font-semibold"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {loading ? "Creating Account…" : "Register Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* GOOGLE SIGN IN */}
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or continue with
            <span className="h-px flex-1 bg-border" />
          </div>

          {GOOGLE_CLIENT_ID ? (
            <div
              ref={googleButtonRef}
              className={`flex min-h-10 justify-center ${loading ? "pointer-events-none opacity-60" : ""}`}
              aria-label="Continue with Google"
              aria-busy={loading}
            />
          ) : (
            <div className="text-center text-xs text-muted-foreground">
              Use email and password credentials to sign in.
            </div>
          )}

          {/* QUICK MOBILE DEMO ACCESS HINT */}
          <div className="lg:hidden p-4 rounded-xl border border-border bg-secondary/40 space-y-2">
            <p className="text-xs font-bold text-foreground">Demo Accounts:</p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_PERSONAS.map((p) => (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => fillDemoPersona(p)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-secondary"
                >
                  {p.role}: {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
