import { BarChart3, FileUp, Landmark, LayoutDashboard, ListOrdered, TrendingUp, Wallet } from "lucide-react";
import type { ToolManifest } from "@platform/shell/ToolManifest";
import { MONEY_ROUTES } from "./routes";

export const moneyManifest: ToolManifest = {
  id: "money",
  name: "Money",
  description: "Every account, money movement and investment in one double-entry ledger.",
  icon: Wallet,
  nav: [
    { title: "Overview", icon: LayoutDashboard, href: MONEY_ROUTES.home },
    { title: "Accounts", icon: Landmark, href: MONEY_ROUTES.accounts },
    { title: "Transactions", icon: ListOrdered, href: MONEY_ROUTES.transactions },
    { title: "Insights", icon: TrendingUp, href: MONEY_ROUTES.insights },
    { title: "Reports", icon: BarChart3, href: MONEY_ROUTES.reports },
    { title: "Import", icon: FileUp, href: MONEY_ROUTES.imports },
  ],
  settings: [
    {
      title: "Money",
      description: "Base currency, categories, automation",
      icon: Wallet,
      href: MONEY_ROUTES.settings,
    },
  ],
};
