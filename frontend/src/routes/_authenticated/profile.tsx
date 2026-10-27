import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ApiError,
  changePassword,
  createDoctorProfile,
  getCurrentUser,
  getSavedUser,
  getMyDoctorProfile,
  saveAuth,
  updateCurrentUser,
  updateDoctorProfile,
  type AuthUser,
} from "@/lib/api";
import { refreshRealtimeAuthentication } from "@/lib/realtime";
import { clinicDateKey } from "@/lib/dates";
import { SPECIALTIES } from "@/lib/specialties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DoctorScheduleManager } from "@/components/DoctorScheduleManager";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — CareFlow" },
      {
        name: "description",
        content: "Update your CareFlow details, clinic information and availability.",
      },
      { property: "og:title", content: "My profile — CareFlow" },
      { property: "og:description", content: "Manage your CareFlow profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const signedInUser = getSavedUser();

  type DoctorProfileForm = {
    specialization: string;
    qualification: string;
    experienceYears: string;
    licenseNumber: string;
    consultationFee: string;
    bio: string;
    isAvailable: boolean;
  };

  const emptyDoctorProfile: DoctorProfileForm = {
    specialization: "",
    qualification: "",
    experienceYears: "0",
    licenseNumber: "",
    consultationFee: "0",
    bio: "",
    isAvailable: true,
  };

  function DoctorProfileEditor() {
    const queryClient = useQueryClient();
    const savedUser = getSavedUser();
    const [form, setForm] = useState(emptyDoctorProfile);
    const [fullName, setFullName] = useState(savedUser?.name ?? "");
    const [savingName, setSavingName] = useState(false);
    const [saving, setSaving] = useState(false);
    const profileQuery = useQuery({
      queryKey: ["doctor-profile"],
      queryFn: async () => {
        try {
          return await getMyDoctorProfile();
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }
      },
    });

    useEffect(() => {
      const profile = profileQuery.data;
      if (!profile) return;
      setForm({
        specialization: profile.specialization,
        qualification: profile.qualification,
        experienceYears: String(profile.experienceYears),
        licenseNumber: profile.licenseNumber ?? "",
        consultationFee: String(profile.consultationFee),
        bio: profile.bio ?? "",
        isAvailable: profile.isAvailable,
      });
    }, [profileQuery.data]);

    function updateField<K extends keyof DoctorProfileForm>(key: K, value: DoctorProfileForm[K]) {
      setForm((current) => ({ ...current, [key]: value }));
    }

    async function saveName(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setSavingName(true);
      try {
        const user = await updateCurrentUser({ name: fullName.trim() });
        setFullName(user.name);
        await queryClient.invalidateQueries({ queryKey: ["doctors"] });
        await queryClient.invalidateQueries({ queryKey: ["doctor"] });
        toast.success("Name updated.");
      } catch (error) {
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Could not update your name. Please try again.",
        );
      } finally {
        setSavingName(false);
      }
    }

    async function save(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      setSaving(true);

      const profile = {
        specialization: form.specialization.trim(),
        qualification: form.qualification.trim(),
        experienceYears: Number(form.experienceYears),
        consultationFee: Number(form.consultationFee),
        bio: form.bio.trim(),
        isAvailable: form.isAvailable,
      };

      try {
        if (profileQuery.data) {
          await updateDoctorProfile(profile);
        } else {
          await createDoctorProfile({
            ...profile,
            licenseNumber: form.licenseNumber.trim(),
          });
        }
        await queryClient.invalidateQueries({ queryKey: ["doctor-profile"] });
        await queryClient.invalidateQueries({ queryKey: ["doctors"] });
        toast.success("Doctor profile saved.");
      } catch (error) {
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Could not save your doctor profile. Please try again.",
        );
      } finally {
        setSaving(false);
      }
    }

    if (profileQuery.isLoading) {
      return <Skeleton className="mx-auto h-96 max-w-2xl" />;
    }

    if (profileQuery.isError) {
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="font-display text-3xl font-semibold">My profile</h1>
          <p className="text-sm text-muted-foreground" role="alert">
            Doctor profile could not be loaded.
          </p>
          <Button variant="outline" onClick={() => void profileQuery.refetch()}>
            Try again
          </Button>
        </div>
      );
    }

    const isCreatingProfile = profileQuery.data === null;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="font-display text-3xl font-semibold">My profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage the professional details shown in the doctor directory.
          </p>
        </header>
        <form
          className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-end"
          onSubmit={saveName}
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="doctor-full-name">Full name</Label>
            <Input
              id="doctor-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={savingName}>
            {savingName ? "Saving…" : "Update name"}
          </Button>
        </form>
        <form className="surface-card grid gap-4 p-6 sm:grid-cols-2" onSubmit={save}>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-specialization">Specialty</Label>
            <select
              id="doctor-specialization"
              className={sel}
              value={form.specialization}
              onChange={(event) => updateField("specialization", event.target.value)}
              required
            >
              <option value="" disabled>
                Select a specialty
              </option>
              {SPECIALTIES.map((specialty) => (
                <option key={specialty} value={specialty}>
                  {specialty}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-qualification">Qualification</Label>
            <Input
              id="doctor-qualification"
              value={form.qualification}
              onChange={(event) => updateField("qualification", event.target.value)}
              maxLength={200}
              required
            />
          </div>
          {isCreatingProfile ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doctor-license">Professional license number</Label>
              <Input
                id="doctor-license"
                value={form.licenseNumber}
                onChange={(event) => updateField("licenseNumber", event.target.value)}
                maxLength={100}
                required
              />
              <p className="text-xs text-muted-foreground">
                Used to create your profile and not shown in the public directory.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="doctor-license">Professional license number</Label>
              <Input id="doctor-license" value={form.licenseNumber} readOnly />
              <p className="text-xs text-muted-foreground">
                Contact an administrator if this verification detail needs correction.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="doctor-experience">Experience (years)</Label>
            <Input
              id="doctor-experience"
              type="number"
              min={0}
              max={80}
              step={1}
              value={form.experienceYears}
              onChange={(event) => updateField("experienceYears", event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-fee">Consultation fee (₹)</Label>
            <Input
              id="doctor-fee"
              type="number"
              min={0}
              max={1000000}
              step="0.01"
              value={form.consultationFee}
              onChange={(event) => updateField("consultationFee", event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="doctor-bio">Professional biography</Label>
            <Textarea
              id="doctor-bio"
              rows={4}
              maxLength={1000}
              value={form.bio}
              onChange={(event) => updateField("bio", event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(event) => updateField("isAvailable", event.target.checked)}
            />
            Available for appointments
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </form>
        <DoctorScheduleManager profileExists={!isCreatingProfile} />
      </div>
    );
  }

  const profile =
    signedInUser?.role === "doctor" ? (
      <DoctorProfileEditor />
    ) : signedInUser?.role === "patient" ? (
      <PatientProfileEditor />
    ) : (
      <p className="text-muted-foreground">Admins don't have a clinical profile.</p>
    );

  return (
    <>
      {profile}
      <AccountSecurity />
    </>
  );
}

function AccountSecurity() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const token = await changePassword({ currentPassword, newPassword });
      const user = getSavedUser();
      if (!user) {
        throw new ApiError("Please sign in again to continue.", 401);
      }
      saveAuth(token, user);
      refreshRealtimeAuthentication(token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated. Other sessions have been signed out.");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not update your password. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface-card mx-auto mt-6 max-w-2xl space-y-4 p-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Account security</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Change your password. Other signed-in sessions will be logged out.
        </p>
      </div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Updating…" : "Change password"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PatientProfileEditor() {
  type PatientProfileForm = {
    name: string;
    phone: string;
    dateOfBirth: string;
    gender: AuthUser["gender"] | "";
    bloodGroup: AuthUser["bloodGroup"] | "";
    address: string;
  };
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: getCurrentUser,
  });
  const [form, setForm] = useState<PatientProfileForm>({
    name: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    bloodGroup: "",
    address: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const user = profileQuery.data;
    if (!user) return;
    setForm({
      name: user.name,
      phone: user.phone ?? "",
      dateOfBirth: user.dateOfBirth ?? "",
      gender: user.gender ?? "",
      bloodGroup: user.bloodGroup ?? "",
      address: user.address ?? "",
    });
  }, [profileQuery.data]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateCurrentUser({
        name: form.name.trim(),
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        bloodGroup: form.bloodGroup || null,
        address: form.address.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["current-user"] });
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Profile saved.");
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not save your profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (profileQuery.isLoading) {
    return <Skeleton className="mx-auto h-96 max-w-2xl" />;
  }
  if (profileQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="font-display text-3xl font-semibold">My profile</h1>
        <p className="text-sm text-destructive" role="alert">
          Patient profile could not be loaded.
        </p>
        <Button variant="outline" onClick={() => void profileQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">My profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your personal and health profile details.
        </p>
      </header>
      <form className="surface-card grid gap-4 p-6 sm:grid-cols-2" onSubmit={save}>
        <div className="space-y-1.5">
          <Label htmlFor="patient-name">Full name</Label>
          <Input
            id="patient-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            minLength={2}
            maxLength={100}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="patient-phone">Phone</Label>
          <Input
            id="patient-phone"
            type="tel"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            maxLength={32}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="patient-dob">Date of birth</Label>
          <Input
            id="patient-dob"
            type="date"
            max={clinicDateKey()}
            value={form.dateOfBirth}
            onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="patient-gender">Gender</Label>
          <select
            id="patient-gender"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.gender}
            onChange={(event) =>
              setForm({
                ...form,
                gender: ["Female", "Male", "Other"].includes(event.target.value)
                  ? (event.target.value as AuthUser["gender"])
                  : "",
              })
            }
          >
            <option value="">—</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="patient-blood-group">Blood group</Label>
          <select
            id="patient-blood-group"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.bloodGroup}
            onChange={(event) =>
              setForm({
                ...form,
                bloodGroup: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(
                  event.target.value,
                )
                  ? (event.target.value as AuthUser["bloodGroup"])
                  : "",
              })
            }
          >
            <option value="">—</option>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="patient-address">Address</Label>
          <Textarea
            id="patient-address"
            rows={3}
            maxLength={500}
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
