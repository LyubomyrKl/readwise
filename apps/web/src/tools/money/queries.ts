"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { moneyApi } from "./api";
import type { Movement, TransactionFilters } from "./types";

/** Query keys of the money tool; every write invalidates `money` so balances and views stay true. */
export const moneyKeys = {
  all: ["money"] as const,
  currencies: ["money", "currencies"] as const,
  settings: ["money", "settings"] as const,
  institutions: ["money", "institutions"] as const,
  accounts: (archived: boolean) => ["money", "accounts", archived] as const,
  account: (id: string) => ["money", "account", id] as const,
  categories: (archived: boolean) => ["money", "categories", archived] as const,
  transactions: (filters: TransactionFilters) => ["money", "transactions", filters] as const,
  transaction: (id: string) => ["money", "transaction", id] as const,
  importProfiles: ["money", "import-profiles"] as const,
  imports: ["money", "imports"] as const,
  importBatch: (id: string) => ["money", "import", id] as const,
  importRows: (id: string, status: string, offset: number) => ["money", "import", id, "rows", status, offset] as const,
  importBalances: (id: string) => ["money", "import", id, "balances"] as const,
  assets: (archived: boolean) => ["money", "assets", archived] as const,
  classes: ["money", "classes"] as const,
  prices: (assetId: string) => ["money", "prices", assetId] as const,
  positions: (accountId?: string) => ["money", "positions", accountId ?? "all"] as const,
  lots: (accountId: string, assetId: string) => ["money", "lots", accountId, assetId] as const,
  home: (base: string) => ["money", "views", "home", base] as const,
  netWorth: (base: string, asOf: string) => ["money", "views", "net-worth", base, asOf] as const,
  allocation: (base: string, asOf: string) => ["money", "views", "allocation", base, asOf] as const,
  monthly: (base: string, from: string) => ["money", "views", "monthly", base, from] as const,
  month: (month: string, base: string) => ["money", "views", "month", month, base] as const,
  period: (base: string, from: string, to: string) => ["money", "views", "period", base, from, to] as const,
  history: (base: string, from: string) => ["money", "views", "history", base, from] as const,
  snapshots: ["money", "snapshots"] as const,
  rates: (filter: string) => ["money", "rates", filter] as const,
  automation: ["money", "automation"] as const,
  tokens: ["money", "tokens"] as const,
  oauthInfo: ["money", "oauth-info"] as const,
  snapshot: (id: string) => ["money", "snapshot", id] as const,
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

/** A mutation that refreshes everything money-related and reports errors as toasts. */
export function useMoneyMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { success?: string | ((result: TResult) => string); onSuccess?: (result: TResult) => void } = {}
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: moneyKeys.all });
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(result) : opts.success);
      opts.onSuccess?.(result);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useCurrencies() {
  return useQuery({ queryKey: moneyKeys.currencies, queryFn: moneyApi.currencies, staleTime: Infinity });
}

export function useMoneySettings() {
  return useQuery({ queryKey: moneyKeys.settings, queryFn: moneyApi.settings.get });
}

export function useInstitutions() {
  return useQuery({ queryKey: moneyKeys.institutions, queryFn: moneyApi.institutions.list });
}

export function useAccounts(archived = false) {
  return useQuery({ queryKey: moneyKeys.accounts(archived), queryFn: () => moneyApi.accounts.list(archived) });
}

export function useAccount(id: string | undefined) {
  return useQuery({
    queryKey: moneyKeys.account(id ?? ""),
    queryFn: () => moneyApi.accounts.get(id!),
    enabled: !!id,
  });
}

export function useCategories(archived = false) {
  return useQuery({ queryKey: moneyKeys.categories(archived), queryFn: () => moneyApi.categories.list(archived) });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: moneyKeys.transaction(id ?? ""),
    queryFn: () => moneyApi.transactions.get(id!),
    enabled: !!id,
  });
}

/** Pages of transactions, newest first; `fetchNextPage` follows the cursor. */
export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: moneyKeys.transactions(filters),
    queryFn: ({ pageParam }) => moneyApi.transactions.list({ ...filters, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function usePostMovement(onSuccess?: () => void) {
  return useMoneyMutation((movement: Movement) => moneyApi.movements.post(movement), {
    success: "Saved",
    onSuccess,
  });
}

export function useImportProfiles() {
  return useQuery({ queryKey: moneyKeys.importProfiles, queryFn: moneyApi.imports.profiles, staleTime: Infinity });
}

export function useImports() {
  return useQuery({ queryKey: moneyKeys.imports, queryFn: moneyApi.imports.list });
}

export function useImportBatch(id: string | undefined) {
  return useQuery({ queryKey: moneyKeys.importBatch(id ?? ""), queryFn: () => moneyApi.imports.get(id!), enabled: !!id });
}

export function useImportRows(id: string, status: string, offset: number) {
  return useQuery({
    queryKey: moneyKeys.importRows(id, status, offset),
    queryFn: () => moneyApi.imports.rows(id, { status: status === "all" ? undefined : (status as never), offset, limit: 100 }),
  });
}

export function useImportBalances(id: string, enabled: boolean) {
  return useQuery({ queryKey: moneyKeys.importBalances(id), queryFn: () => moneyApi.imports.balances(id), enabled });
}

export function useAssets(archived = false) {
  return useQuery({ queryKey: moneyKeys.assets(archived), queryFn: () => moneyApi.assets.list(archived) });
}

export function useAssetClasses() {
  return useQuery({ queryKey: moneyKeys.classes, queryFn: moneyApi.classes.list });
}

export function usePrices(assetId: string | undefined) {
  return useQuery({ queryKey: moneyKeys.prices(assetId ?? ""), queryFn: () => moneyApi.prices.list(assetId!), enabled: !!assetId });
}

export function usePositions(accountId?: string) {
  return useQuery({ queryKey: moneyKeys.positions(accountId), queryFn: () => moneyApi.positions({ accountId }) });
}

export function useLots(accountId: string, assetId: string, enabled = true) {
  return useQuery({
    queryKey: moneyKeys.lots(accountId, assetId),
    queryFn: () => moneyApi.lots({ accountId, assetId }),
    enabled,
  });
}

// Views keep showing the previous answer while a new base currency or range loads.

export function useHome(base?: string) {
  return useQuery({ queryKey: moneyKeys.home(base ?? ""), queryFn: () => moneyApi.views.home(base), placeholderData: keepPreviousData });
}

export function useNetWorth(base?: string, asOf?: string) {
  return useQuery({
    queryKey: moneyKeys.netWorth(base ?? "", asOf ?? ""),
    queryFn: () => moneyApi.views.netWorth({ base, asOf }),
    placeholderData: keepPreviousData,
  });
}

export function useAllocation(base?: string, asOf?: string) {
  return useQuery({
    queryKey: moneyKeys.allocation(base ?? "", asOf ?? ""),
    queryFn: () => moneyApi.views.allocation({ base, asOf }),
    placeholderData: keepPreviousData,
  });
}

/** Months from `from` (YYYY-MM or "start") to this month. */
export function useMonthly(base: string | undefined, from: string) {
  return useQuery({
    queryKey: moneyKeys.monthly(base ?? "", from),
    queryFn: () => moneyApi.views.monthly({ base, from }),
    placeholderData: keepPreviousData,
  });
}

export function useMonth(month: string | undefined, base?: string) {
  return useQuery({
    queryKey: moneyKeys.month(month ?? "", base ?? ""),
    queryFn: () => moneyApi.views.month(month!, base),
    enabled: !!month,
    placeholderData: keepPreviousData,
  });
}

/** Totals and categories from `from` (YYYY-MM or "start") to `to` (default this month); off while `enabled` is false. */
export function usePeriod(base: string | undefined, from: string, to?: string, enabled = true) {
  return useQuery({
    queryKey: moneyKeys.period(base ?? "", from, to ?? ""),
    queryFn: () => moneyApi.views.period({ base, from, to }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Net worth at each month end from `from` (YYYY-MM or "start") to today. */
export function useHistory(base: string | undefined, from: string) {
  return useQuery({
    queryKey: moneyKeys.history(base ?? "", from),
    queryFn: () => moneyApi.views.history({ base, from }),
    placeholderData: keepPreviousData,
  });
}

export function useSnapshots() {
  return useQuery({ queryKey: moneyKeys.snapshots, queryFn: moneyApi.snapshots.list });
}

export function useSnapshot(id: string | undefined) {
  return useQuery({ queryKey: moneyKeys.snapshot(id ?? ""), queryFn: () => moneyApi.snapshots.get(id!), enabled: !!id });
}

export function useRates(query: { from?: string; to?: string; source?: string }) {
  return useQuery({ queryKey: moneyKeys.rates(JSON.stringify(query)), queryFn: () => moneyApi.rates.list(query) });
}

/** Refreshes every few seconds while a job it started is still running. */
export function useAutomation() {
  return useQuery({
    queryKey: moneyKeys.automation,
    queryFn: moneyApi.automation.status,
    refetchInterval: (q) => (q.state.data?.tasks.some((t) => t.lastJob && ["queued", "running", "waiting"].includes(t.lastJob.status)) ? 3000 : false),
  });
}

export function useApiTokens() {
  return useQuery({ queryKey: moneyKeys.tokens, queryFn: moneyApi.tokens.list });
}

/** The public MCP URL for Claude's custom connector (null when the server has none). */
export function useOAuthInfo() {
  return useQuery({ queryKey: moneyKeys.oauthInfo, queryFn: moneyApi.oauth.info, staleTime: Infinity });
}

/** Allow on the connect page; the page shows the error itself and then leaves for the redirect. */
export function useOAuthAuthorize() {
  return useMutation({ mutationFn: moneyApi.oauth.authorize });
}
