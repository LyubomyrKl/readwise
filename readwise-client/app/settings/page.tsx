"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings, Palette, BookOpen, User, ChevronRight } from "lucide-react";
import { useMotion } from "../(providers)/MotionProvider/MotionProvider";
import { ROUTES } from "../(consts)/routes";

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

const settingsSections = [
  {
    title: "Appearance",
    description: "Theme, animations, and visual preferences",
    icon: Palette,
    href: ROUTES.settings.appearance,
  },
  {
    title: "Reader",
    description: "Book covers and reading experience",
    icon: BookOpen,
    href: ROUTES.settings.reader,
  },
  {
    title: "Account",
    description: "Manage your session and profile",
    icon: User,
    href: ROUTES.settings.account,
  },
];

export default function SettingsPage() {
  const { enabled } = useMotion();

  const Wrapper: React.ElementType = enabled ? motion.div : "div";
  const Child: React.ElementType = enabled ? motion.div : "div";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your preferences and account settings
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
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {settingsSections.map((section) => {
          const Icon = section.icon;
          return (
            <Child key={section.href} {...(enabled ? { variants: item } : {})}>
              <Link href={section.href}>
                <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer group">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardTitle className="text-lg mb-1">{section.title}</CardTitle>
                    <CardDescription className="text-sm">
                      {section.description}
                    </CardDescription>
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
