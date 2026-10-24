"use client";

import { motion, Variants } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Palette, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@platform/ui/ThemeToggle";
import { useMotion } from "@platform/providers/MotionProvider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
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

export default function AppearanceSettingsPage() {
  const { enabled, mode, setMode } = useMotion();

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
          <Palette className="h-6 w-6" />
          Appearance
        </h1>
        <p className="text-muted-foreground mt-1">
          Customize how the app looks and feels
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
            <CardTitle>Theme</CardTitle>
            <CardDescription>
              Choose between light and dark mode
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Animations</CardTitle>
            <CardDescription>
              Control motion and animation effects
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="font-medium text-sm">Advanced animations</div>
                <p className="text-xs text-muted-foreground">
                  Currently {enabled ? "enabled" : "disabled"}. System default respects your OS preferences.
                </p>
              </div>
              <Select value={mode} onValueChange={(v) => setMode(v as "system" | "on" | "off")}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="System" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System default</SelectItem>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </Wrapper>
    </div>
  );
}
