import { FileUp, Inbox, Landmark, LayoutDashboard, ListOrdered, Plus, Wallet } from "lucide-react";
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
    { title: "Drafts", icon: Inbox, href: MONEY_ROUTES.drafts },
    { title: "Import", icon: FileUp, href: MONEY_ROUTES.imports },
  ],
  actionButton: { title: "New movement", href: MONEY_ROUTES.newMovement(), icon: Plus },
  settings: [
    {
      title: "Money",
      description: "Base currency, tax rules, categories",
      icon: Wallet,
      href: MONEY_ROUTES.settings,
    },
  ],
};
