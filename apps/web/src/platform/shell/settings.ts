import { Palette, Settings as SettingsIcon, User } from "lucide-react";
import { PLATFORM_ROUTES } from "@platform/routes";
import { TOOLS } from "./registry";
import type { NavItem, SettingsSection } from "./ToolManifest";

export const PLATFORM_SETTINGS: SettingsSection[] = [
  {
    title: "Appearance",
    description: "Theme, animations, and visual preferences",
    icon: Palette,
    href: PLATFORM_ROUTES.settings.appearance,
  },
  {
    title: "Account",
    description: "Manage your session and profile",
    icon: User,
    href: PLATFORM_ROUTES.settings.account,
  },
];

/** Platform sections first, then whatever each enabled tool contributes. */
export function settingsSections(): SettingsSection[] {
  return [...PLATFORM_SETTINGS, ...TOOLS.flatMap((tool) => tool.settings ?? [])];
}

export function settingsNav(): NavItem[] {
  return [
    { title: "General", icon: SettingsIcon, href: PLATFORM_ROUTES.settings.root },
    ...settingsSections().map((section) => ({
      title: section.title,
      icon: section.icon ?? SettingsIcon,
      href: section.href,
    })),
  ];
}
