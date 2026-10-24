import type { LucideIcon } from "lucide-react";
import { TOOLS_BASE_PATH } from "@platform/routes";

export type SubItem = { title: string; href: string };

export type NavItem =
  | { title: string; icon: LucideIcon; href: string }
  | { title: string; icon: LucideIcon; items: SubItem[]; defaultOpen?: boolean };

export type ActionButton = { title: string; href: string; icon?: LucideIcon };

export type SettingsSection = {
  title: string;
  description: string;
  href: string;
  icon?: LucideIcon;
};

/**
 * What a tool tells the shell about itself. Deliberately small: add a field
 * only when a second tool needs it.
 */
export interface ToolManifest {
  /** Stable key and URL segment: the tool is mounted at /apps/<id>. */
  id: string;
  name: string;
  /** One sentence for the dashboard card. */
  description: string;
  icon: LucideIcon;
  /** Sidebar entries while inside the tool; hrefs are absolute. */
  nav: NavItem[];
  actionButton?: ActionButton;
  /** Sections contributed to /settings; the pages themselves are route files. */
  settings?: SettingsSection[];
  /** Set to false to hide a tool without deleting it. */
  enabled?: boolean;
}

export function toolBasePath(id: string): string {
  return `${TOOLS_BASE_PATH}/${id}`;
}
