"use client";

import { useTransition } from "react";
import { motion, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LogOut, User, ArrowLeft } from "lucide-react";
import { useMotion } from "@platform/providers/MotionProvider";
import { toast } from "sonner";
import { authApi } from "@platform/api/auth";
import { clearAppCaches } from "@platform/pwa/caches";
import Link from "next/link";

import { PLATFORM_ROUTES } from "@platform/routes";
import { SecuritySettings } from "@platform/auth/SecuritySettings";
const container: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export default function AccountSettingsPage() {
  const [pending, start] = useTransition();
  const { enabled } = useMotion();

  async function logout(everywhere = false) {
    start(async () => {
      let failure: string | null = null;
      try {
        await (everywhere ? authApi.logoutAll() : authApi.logout());
      } catch (e) {
        failure = e instanceof Error ? e.message : "Please try again later.";
      }
      await clearAppCaches();
      if (failure) {
        // the cookies of this device are cleared either way; say what the server did not confirm
        toast.error(everywhere ? "Not signed out everywhere" : "Logout not confirmed", { description: failure, duration: 8000 });
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
      // a full load, so nothing of the session stays in memory
      window.location.assign(PLATFORM_ROUTES.auth.login);
    });
  }

  const Wrapper: React.ElementType = enabled ? motion.div : "div";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={PLATFORM_ROUTES.settings.root}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6" />
          Account
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and session
        </p>
      </div>

      <Wrapper
        {...(enabled
          ? {
              variants: container,
              initial: "hidden",
              whileInView: "show",
              viewport: { once: true, margin: "-10%" },
            }
          : {})}
      >
        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>
              Manage your current login session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="font-medium text-sm">Sign out</div>
                <p className="text-xs text-muted-foreground">
                  End your current session. You will be redirected to the login page.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="destructive"
                  onClick={() => logout()}
                  disabled={pending}
                  className="w-full sm:w-auto"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {pending ? "Signing out…" : "Logout"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => logout(true)}
                  disabled={pending}
                  className="w-full sm:w-auto"
                  title="Ends your sessions on every device"
                >
                  Sign out everywhere
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Wrapper>

      <SecuritySettings />
    </div>
  );
}
