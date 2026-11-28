import { TOOLS_BASE_PATH } from "@platform/routes";

const BASE = `${TOOLS_BASE_PATH}/money`;

/** Every URL the money tool owns. The settings page is mounted by the platform hub. */
export const MONEY_ROUTES = Object.freeze({
  base: BASE,
  home: BASE,
  accounts: `${BASE}/accounts`,
  account: (id: string) => `${BASE}/accounts/${id}`,
  transactions: `${BASE}/transactions`,
  newMovement: (kind?: string) => `${BASE}/transactions/new${kind ? `?kind=${kind}` : ""}`,
  transaction: (id: string) => `${BASE}/transactions/${id}`,
  /** where the money is heading: this month on pace, the year, net worth ahead */
  insights: `${BASE}/insights`,
  /** assets, their prices and the allocation's classes; holdings are on each account's page */
  assets: `${BASE}/accounts/assets`,
  reports: `${BASE}/reports`,
  imports: `${BASE}/imports`,
  importBatch: (id: string) => `${BASE}/imports/${id}`,
  /** OAuth approval for Claude's custom connector; not in the navigation */
  connect: `${BASE}/connect`,
  settings: "/settings/money",
} as const);
