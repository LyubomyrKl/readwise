/**
 * The money tool's typed API. Every function is one API endpoint behind the proxy;
 * adding an endpoint means a controller method in apps/api and a line here.
 */
import { apiFetch } from "@platform/api/http";
import type {
  AccountResponse,
  BalancePreview,
  BalanceTarget,
  ImportBatch,
  ImportMapping,
  ImportProfileInfo,
  ImportRowPage,
  ImportRowStatus,
  CategoryResponse,
  CreateAccountInput,
  CurrencyResponse,
  InstitutionKind,
  InstitutionResponse,
  MoneySettings,
  Movement,
  TransactionFilters,
  TransactionPage,
  TransactionResponse,
  UpdateAccountInput,
} from "./types";

const enc = encodeURIComponent;
const post = <T>(path: string, json?: unknown) => apiFetch<T>(path, { method: "POST", json: json ?? {} });
const patch = <T>(path: string, json: unknown) => apiFetch<T>(path, { method: "PATCH", json });

export const moneyApi = {
  currencies: () => apiFetch<CurrencyResponse[]>("/money/currencies"),

  settings: {
    get: () => apiFetch<MoneySettings>("/money/settings"),
    update: (input: Partial<MoneySettings>) => patch<MoneySettings>("/money/settings", input),
  },

  institutions: {
    list: () => apiFetch<InstitutionResponse[]>("/money/institutions"),
    create: (input: { name: string; kind: InstitutionKind }) => post<InstitutionResponse>("/money/institutions", input),
    update: (id: string, input: { name?: string; kind?: InstitutionKind }) =>
      patch<InstitutionResponse>(`/money/institutions/${enc(id)}`, input),
  },

  accounts: {
    list: (archived = false) => apiFetch<AccountResponse[]>("/money/accounts", { query: { archived } }),
    get: (id: string) => apiFetch<AccountResponse>(`/money/accounts/${enc(id)}`),
    create: (input: CreateAccountInput) => post<AccountResponse>("/money/accounts", input),
    update: (id: string, input: UpdateAccountInput) => patch<AccountResponse>(`/money/accounts/${enc(id)}`, input),
    archive: (id: string) => post<AccountResponse>(`/money/accounts/${enc(id)}/archive`),
    unarchive: (id: string) => post<AccountResponse>(`/money/accounts/${enc(id)}/unarchive`),
    addCurrency: (id: string, currency: string) =>
      post<AccountResponse>(`/money/accounts/${enc(id)}/currencies`, { currency }),
  },

  categories: {
    list: (archived = false) => apiFetch<CategoryResponse[]>("/money/categories", { query: { archived } }),
    create: (input: { name: string; kind: "income" | "expense"; parentId?: string | null }) =>
      post<CategoryResponse>("/money/categories", input),
    update: (id: string, input: { name?: string; parentId?: string | null; archived?: boolean }) =>
      patch<CategoryResponse>(`/money/categories/${enc(id)}`, input),
  },

  transactions: {
    list: (filters: TransactionFilters = {}) =>
      apiFetch<TransactionPage>("/money/transactions", { query: { ...filters } }),
    get: (id: string) => apiFetch<TransactionResponse>(`/money/transactions/${enc(id)}`),
    reverse: (id: string, input: { date?: string; note?: string } = {}) =>
      post<TransactionResponse>(`/money/transactions/${enc(id)}/reverse`, input),
  },

  movements: {
    post: (movement: Movement) => post<TransactionResponse>("/money/movements", movement),
    correct: (id: string, movement: Movement) => post<TransactionResponse>(`/money/movements/correct/${enc(id)}`, movement),
  },

  imports: {
    profiles: () => apiFetch<ImportProfileInfo[]>("/money/imports/profiles"),
    list: () => apiFetch<ImportBatch[]>("/money/imports"),
    get: (id: string) => apiFetch<ImportBatch>(`/money/imports/${enc(id)}`),
    upload: (file: File, profile: string, accountId?: string) => {
      const body = new FormData();
      body.append("file", file);
      body.append("profile", profile);
      if (accountId) body.append("accountId", accountId);
      return apiFetch<ImportBatch>("/money/imports", { method: "POST", body });
    },
    rows: (id: string, query: { status?: ImportRowStatus; offset?: number; limit?: number } = {}) =>
      apiFetch<ImportRowPage>(`/money/imports/${enc(id)}/rows`, { query }),
    mapping: (id: string, mapping: ImportMapping) =>
      apiFetch<ImportBatch>(`/money/imports/${enc(id)}/mapping`, { method: "PUT", json: mapping }),
    createAccounts: (id: string, names: string[], institutionName?: string) =>
      post<ImportBatch>(`/money/imports/${enc(id)}/accounts`, { names, institutionName }),
    decide: (id: string, rowId: string, status: "ready" | "skipped") =>
      patch<{ status: string }>(`/money/imports/${enc(id)}/rows/${enc(rowId)}`, { status }),
    balances: (id: string) => apiFetch<BalancePreview[]>(`/money/imports/${enc(id)}/balances`),
    setBalances: (id: string, targets: BalanceTarget[]) =>
      apiFetch<BalancePreview[]>(`/money/imports/${enc(id)}/balances`, { method: "PUT", json: { targets } }),
    commit: (id: string) => post<{ imported: number; openingBalances: number; categoriesCreated: number }>(`/money/imports/${enc(id)}/commit`),
    remove: (id: string) => apiFetch<{ removed: true }>(`/money/imports/${enc(id)}`, { method: "DELETE" }),
  },

  drafts: {
    list: () => apiFetch<TransactionPage>("/money/drafts"),
    create: (movement: Movement) => post<TransactionResponse>("/money/drafts", movement),
    approve: (id: string, input?: Record<string, unknown>) =>
      post<TransactionResponse>(`/money/drafts/${enc(id)}/approve`, input ? { input } : {}),
    reject: (id: string) => apiFetch<{ removed: true }>(`/money/drafts/${enc(id)}`, { method: "DELETE" }),
  },
};
