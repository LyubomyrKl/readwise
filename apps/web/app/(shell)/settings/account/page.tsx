"use client";

import { useTransition } from "react";
import { motion, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LogOut, User, ArrowLeft } from "lucide-react";
import { useMotion } from "@platform/providers/MotionProvider";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetcher";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { PLATFORM_ROUTES } from "@platform/routes";
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
  const router = useRouter();

  async function logout() {
    start(async () => {
      try {
        await apiFetch("POST", "/api/auth/logout", {});
        toast.success("Signed out successfully");
        router.push(PLATFORM_ROUTES.auth.login);
      } catch {
        toast.error("Logout failed", {
          description: "Please try again later.",
          duration: 3000,
        });
      }
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
              <Button
                variant="destructive"
                onClick={logout}
                disabled={pending}
                className="w-full sm:w-auto"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {pending ? "Signing out…" : "Logout"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </Wrapper>
    </div>
  );
}
