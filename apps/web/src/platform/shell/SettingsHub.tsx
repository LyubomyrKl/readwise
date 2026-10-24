"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { ChevronRight, Settings } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMotion } from "@platform/providers/MotionProvider";
import { settingsSections } from "./settings";

const container: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.06 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
};

/** Settings landing page: platform sections plus the ones each tool contributes. */
export function SettingsHub() {
  const { enabled } = useMotion();
  const sections = settingsSections();

  const Wrapper: React.ElementType = enabled ? motion.div : "div";
  const Child: React.ElementType = enabled ? motion.div : "div";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="mt-1 text-muted-foreground">Manage your preferences and account settings</p>
      </div>

      <Wrapper
        {...(enabled
          ? { variants: container, initial: "hidden", whileInView: "show", viewport: { once: true, margin: "-10%" } }
          : {})}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {sections.map((section) => {
          const Icon = section.icon ?? Settings;
          return (
            <Child key={section.href} {...(enabled ? { variants: item } : {})}>
              <Link href={section.href}>
                <Card className="group h-full cursor-pointer transition-colors hover:bg-muted/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardTitle className="mb-1 text-lg">{section.title}</CardTitle>
                    <CardDescription className="text-sm">{section.description}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            </Child>
          );
        })}
      </Wrapper>
    </div>
  );
}
