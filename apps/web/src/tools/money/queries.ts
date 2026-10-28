"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  drafts: ["money", "drafts"] as const,
  importProfiles: ["money", "import-profiles"] as const,
  imports: ["money", "imports"] as const,
  importBatch: (id: string) => ["money", "import", id] as const,
  importRows: (id: string, status: string, offset: number) => ["money", "import", id, "rows", status, offset] as const,
  importBalances: (id: string) => ["money", "import", id, "balances"] as const,
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

export function useDrafts() {
  return useQuery({ queryKey: moneyKeys.drafts, queryFn: moneyApi.drafts.list });
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
