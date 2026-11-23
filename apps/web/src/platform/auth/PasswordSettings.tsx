"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@platform/api/http";
import type { SecondFactorStatus } from "@platform/api/types";
import { errorText } from "./AuthCard";

/** the key SecuritySettings reads the same status under */
const STATUS_KEY = ["platform", "second-factor"] as const;

/** The password, changed with the current one (and the app's code when it is on); the other devices sign in again. */
export function PasswordSettings() {
  const { data: status } = useQuery({ queryKey: STATUS_KEY, queryFn: () => apiFetch<SecondFactorStatus>("/auth/second-factor") });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const totp = !!status?.totpEnabled;
  const problem = !current
    ? "Your current password first"
    : next.length < 8
      ? "A new password of at least 8 characters"
      : next !== repeat
        ? "The two new passwords differ"
        : totp && !/^\s*\d{3}\s?\d{3}\s*$/.test(code)
          ? "The code from your authenticator app"
          : null;

  const change = useMutation({
    mutationFn: () =>
      apiFetch<{ success: true; signedOut: number }>("/auth/password", {
        method: "POST",
        json: { currentPassword: current, newPassword: next, ...(totp ? { code } : {}) },
      }),
    onSuccess: ({ signedOut }) => {
      toast.success("Password changed", {
        description: signedOut === 0 ? undefined : signedOut === 1 ? "Signed out on 1 other device." : `Signed out on ${signedOut} other devices.`,
      });
      setCurrent("");
      setNext("");
      setRepeat("");
      setCode("");
      setError(null);
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" /> Password
        </CardTitle>
        <CardDescription>
          Change it with the current one. This device stays signed in; your other devices sign in again with the new password. Forgot
          it? &quot;Forgot password?&quot; on the sign-in page sets a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid max-w-md gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) change.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="password-current">Current password</Label>
            <Input id="password-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-new">New password</Label>
            <Input id="password-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-repeat">New password again</Label>
            <Input id="password-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </div>
          {totp ? (
            <div className="space-y-2">
              <Label htmlFor="password-code">Code from your authenticator app</Label>
              <Input id="password-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={change.isPending || !!problem}>
              {change.isPending ? "Changing…" : "Change password"}
            </Button>
            {problem && (current || next || repeat) ? <span className="text-xs text-muted-foreground">{problem}</span> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
