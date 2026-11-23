"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@platform/api/auth";
import { AuthCard, errorText } from "@platform/auth/AuthCard";

/**
 * Forgot password: a one-time link to set a new one. By email when the server sends email; else
 * the server's owner prints the link with a command, and this page says which.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState<"email" | "server" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      try {
        setDelivery((await authApi.forgotPassword(email.trim())).delivery);
      } catch (e) {
        setError(errorText(e));
      }
    });

  if (delivery === "email") {
    return (
      <AuthCard title="Check your email" description="If an account has that email, a link to set a new password is on its way.">
        <p className="text-sm text-muted-foreground">
          It works once, for 30 minutes. Nothing in your inbox after a few minutes? Look in spam, or ask for a new link.
        </p>
        <Button variant="outline" className="mt-4 w-full" onClick={() => setDelivery(null)}>
          Ask for a new link
        </Button>
      </AuthCard>
    );
  }

  if (delivery === "server") {
    return (
      <AuthCard title="Get a link from the server" description="This server sends no email, so the link to set a new password comes from the server itself.">
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">On the server, in the app&apos;s folder (/opt/workbench), run:</p>
          <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
            docker compose exec api node dist/platform/auth/reset-password.cli.js {email.trim() || "you@example.com"}
          </pre>
          <p className="text-muted-foreground">
            It prints a link that works once, for 30 minutes. Open it here to choose a new password. With SMTP_URL set on the server,
            this page sends the link by email instead.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot password" description="Get a one-time link to choose a new password.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              required
              className="pl-9"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" size="lg" disabled={pending || !email.trim()}>
          {pending ? "Sending…" : "Send me a link"}
        </Button>
      </form>
    </AuthCard>
  );
}
