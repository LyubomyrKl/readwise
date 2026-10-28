import { LayoutDashboard, Wallet } from "lucide-react";
import type { ToolManifest } from "@platform/shell/ToolManifest";
import { MONEY_ROUTES } from "./routes";

export const moneyManifest: ToolManifest = {
  id: "money",
  name: "Money",
  description: "Every account, money movement and investment in one double-entry ledger.",
  icon: Wallet,
  nav: [{ title: "Overview", icon: LayoutDashboard, href: MONEY_ROUTES.home }],
};
