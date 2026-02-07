"use client";

import { useTransition } from "react";
import { motion, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "./theme-toggle.component";
import { useMotion } from "../(providers)/MotionProvider/MotionProvider";
import { useBookCover } from "../(providers)/BookCoverProvider/BookCoverProvider";
import { BookCover } from "@/app/reader/library/(components)/BookCover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ROUTES } from "../(consts)/routes";
import { toast } from "sonner";
import { apiFetch } from "@/lib/fetcher";
import { useRouter } from "next/navigation";

const container: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1],
      staggerChildren: 0.06,
    },
  },
};
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function SettingsPage() {
  const [pending, start] = useTransition();
  const { enabled, mode, setMode } = useMotion();
  const { backgroundStyle, setBackgroundStyle } = useBookCover();
  const router = useRouter();

  async function logout() {
    start(async () => {
      try {
        await apiFetch("POST", "/api/auth/logout", {});
        router.push(ROUTES.auth.login);
      } catch {
        toast.error("Logout failed", {
          description: "Please try again later.",
          duration: 3000,
        });
      }
    });
  }

  const Wrapper: any = enabled ? motion.div : "div";
  const Child: any = enabled ? motion.div : "div";

  return (
    <Wrapper
      {...(enabled
        ? {
            variants: container,
            initial: "hidden",
            whileInView: "show",
            viewport: { once: true, margin: "-10%" },
          }
        : {})}
      className="grid gap-4 sm:gap-6 md:grid-cols-2 md:grid-rows-2"
    >
      {/* Left column: spans 2 rows */}
      <Child {...(enabled ? { variants: item } : {})} className="md:row-span-2">
        <Card className="h-full overflow-hidden border-0 shadow-lg ring-1 ring-border/60">
          <CardHeader className="gap-1 pb-2 px-4 sm:px-6">
            <CardTitle className="text-lg sm:text-xl">Appearance</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Choose how the app looks on your device.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col space-y-4 pb-4 px-4 sm:px-6">
            <div>
              <div className="mb-2 text-sm text-muted-foreground">Theme</div>
              <ThemeToggle />
            </div>

            <Separator />

            <div>
              <div className="mb-2 text-sm text-muted-foreground">
                Book Cover Style
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Classic Preview */}
                <div
                  className={`relative cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                    backgroundStyle === "classic"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80"
                  }`}
                  onClick={() => setBackgroundStyle("classic")}
                >
                  <div className="aspect-[2/3] w-full">
                    <BookCover
                      title="Classic Novel"
                      author="Author Name"
                      backgroundStyle="classic"
                      className="rounded-sm"
                    />
                  </div>
                  <p className="mt-2 text-center text-xs font-medium">
                    Classic
                  </p>
                </div>

                {/* Modern Preview */}
                <div
                  className={`relative cursor-pointer rounded-lg border-2 p-2 transition-colors ${
                    backgroundStyle === "modern"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80"
                  }`}
                  onClick={() => setBackgroundStyle("modern")}
                >
                  <div className="aspect-[2/3] w-full">
                    <BookCover
                      title="Example Book"
                      author="Author Name"
                      backgroundStyle="modern"
                      className="rounded-sm"
                    />
                  </div>
                  <p className="mt-2 text-center text-xs font-medium">Modern</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Choose between classic elegance or modern clean designs for book
                covers without images.
              </p>
            </div>

            <Separator />

            <div>
              <div>
                <div className="mb-2 text-sm text-muted-foreground">
                  Advanced animations
                </div>

                <div className="mt-auto pt-2 pb-2">
                  <p className="text-xs text-muted-foreground">
                    The theme syncs with your OS when set to System.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="System" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System default</SelectItem>
                      <SelectItem value="on">On</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Currently {enabled ? "enabled" : "disabled"}.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Child>

      <Child
        {...(enabled ? { variants: item } : {})}
        className="md:col-start-2 md:row-start-1"
      >
        <Card className="overflow-hidden border-0 shadow-lg ring-1 ring-border/60">
          <CardHeader className="gap-1 pb-2 px-4 sm:px-6">
            <CardTitle className="text-lg sm:text-xl">Account</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Manage your session.</CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col sm:flex-row gap-3 sm:justify-between pb-4 px-4 sm:px-6">
            <div>
              <div className="text-sm font-medium">Sign out</div>
              <p className="text-xs text-muted-foreground">
                You will be redirected to login.
              </p>
            </div>
            <Button variant="destructive" onClick={logout} disabled={pending} className="w-full sm:w-auto">
              <LogOut className="mr-2 h-4 w-4" />
              {pending ? "Signing out…" : "Logout"}
            </Button>
          </CardContent>
        </Card>
      </Child>
    </Wrapper>
  );
}
