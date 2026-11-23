"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@platform/api/auth";
import { AuthCard, errorText } from "@platform/auth/AuthCard";
import { PLATFORM_ROUTES } from "@platform/routes";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}

/** A one-time link's page: a new password, then signing in with it (every session ended). */
function ResetPassword() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const problem = password.length < 8 ? "At least 8 characters" : password !== repeat ? "The two passwords differ" : null;

  const submit = () =>
    start(async () => {
      setError(null);
      try {
        await authApi.resetPassword(token, password);
        // every session ended, this device's too: its cookies go
        await authApi.logout().catch(() => undefined);
        setDone(true);
      } catch (e) {
        setError(errorText(e));
      }
    });

  if (!token) {
    return (
      <AuthCard title="This link is incomplete" description="Open the whole link, or ask for a new one.">
        <Button asChild className="w-full">
          <Link href={PLATFORM_ROUTES.auth.forgotPassword}>Ask for a new link</Link>
        </Button>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Your password is set" description="Sign in with it. Every device was signed out and signs in again with the new password.">
        <Button className="w-full" size="lg" onClick={() => window.location.assign(PLATFORM_ROUTES.auth.login)}>
          Sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="This link works once. Every device is signed out when the new password is set.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problem) submit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="reset-password">New password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              className="pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset-repeat">The same again</Label>
          <Input id="reset-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          {password && problem ? <p className="text-xs text-muted-foreground">{problem}</p> : null}
        </div>
        {error ? (
          <p className="text-sm text-destructive">
            {error}{" "}
            <Link className="underline underline-offset-4" href={PLATFORM_ROUTES.auth.forgotPassword}>
              New link
            </Link>
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" disabled={pending || !!problem}>
          {pending ? "Setting it…" : "Set the new password"}
        </Button>
      </form>
    </AuthCard>
  );
}
