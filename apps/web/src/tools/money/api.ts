/**
 * The money tool's typed API. Every function is one API endpoint behind the proxy;
 * adding an endpoint means a controller method in apps/api and a line here.
 */
import { apiFetch } from "@platform/api/http";
import type {
  ApiToken,
  CreatedApiToken,
  TokenScope,
  AutomationJob,
  AutomationStatus,
  MoneyTask,
  RateRow,
  AccountResponse,
  AllocationResponse,
  HistoryResponse,
  HomeResponse,
  MonthDetail,
  MonthlyResponse,
  PeriodDetail,
  NetWorthResponse,
  SnapshotResponse,
  AssetClassResponse,
  AssetResponse,
  CreateAssetInput,
  LotResponse,
  PositionResponse,
  PriceResponse,
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
    /** `id` goes away: its currencies move into `intoAccountId` with their whole history; returns the merged account */
    merge: (id: string, input: { intoAccountId: string; name?: string }) =>
      post<AccountResponse>(`/money/accounts/${enc(id)}/merge`, input),
    addCurrency: (id: string, currency: string) =>
      post<AccountResponse>(`/money/accounts/${enc(id)}/currencies`, { currency }),
    /** the IBAN or account number of one currency; null or empty clears it */
    setNumber: (id: string, currency: string, number: string | null) =>
      patch<AccountResponse>(`/money/accounts/${enc(id)}/currencies/${enc(currency)}`, { number }),
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

  assets: {
    list: (archived = false) => apiFetch<AssetResponse[]>("/money/assets", { query: { archived } }),
    create: (input: CreateAssetInput) => post<AssetResponse>("/money/assets", input),
    update: (
      id: string,
      input: Partial<Omit<CreateAssetInput, "isin" | "ticker">> & { archived?: boolean; isin?: string | null; ticker?: string | null }
    ) =>
      patch<AssetResponse>(`/money/assets/${enc(id)}`, input),
    setClasses: (id: string, classes: { classId: string; percent: string }[]) =>
      apiFetch<AssetResponse>(`/money/assets/${enc(id)}/classes`, { method: "PUT", json: { classes } }),
  },

  classes: {
    list: () => apiFetch<AssetClassResponse[]>("/money/asset-classes"),
    create: (input: { name: string; targetPercent?: string; sortOrder?: number }) =>
      post<AssetClassResponse>("/money/asset-classes", input),
    update: (id: string, input: { name?: string; sortOrder?: number }) =>
      patch<AssetClassResponse>(`/money/asset-classes/${enc(id)}`, input),
    setTarget: (id: string, percent: string, validFrom: string) =>
      apiFetch<AssetClassResponse>(`/money/asset-classes/${enc(id)}/target`, { method: "PUT", json: { percent, validFrom } }),
  },

  prices: {
    list: (assetId: string) => apiFetch<PriceResponse[]>("/money/prices", { query: { assetId } }),
    record: (input: { assetId: string; date: string; price: string }) => post<PriceResponse>("/money/prices", input),
    remove: (id: string) => apiFetch<{ removed: true }>(`/money/prices/${enc(id)}`, { method: "DELETE" }),
  },

  positions: (query: { accountId?: string; asOf?: string } = {}) =>
    apiFetch<PositionResponse[]>("/money/positions", { query }),
  lots: (query: { accountId?: string; assetId?: string; open?: boolean } = {}) =>
    apiFetch<LotResponse[]>("/money/lots", { query }),

  views: {
    home: (base?: string) => apiFetch<HomeResponse>("/money/views/home", { query: { base } }),
    netWorth: (query: { base?: string; asOf?: string } = {}) => apiFetch<NetWorthResponse>("/money/views/net-worth", { query }),
    allocation: (query: { base?: string; asOf?: string } = {}) =>
      apiFetch<AllocationResponse>("/money/views/allocation", { query }),
    monthly: (query: { base?: string; from?: string; to?: string } = {}) =>
      apiFetch<MonthlyResponse>("/money/views/monthly", { query }),
    month: (month: string, base?: string) => apiFetch<MonthDetail>(`/money/views/month/${enc(month)}`, { query: { base } }),
    /** Totals and categories over a span; `from` is YYYY-MM or "start", the default the last 12 months. */
    period: (query: { base?: string; from?: string; to?: string } = {}) => apiFetch<PeriodDetail>("/money/views/period", { query }),
    history: (query: { base?: string; from?: string; to?: string } = {}) =>
      apiFetch<HistoryResponse>("/money/views/history", { query }),
  },

  snapshots: {
    list: () => apiFetch<SnapshotResponse[]>("/money/snapshots"),
    get: (id: string) => apiFetch<SnapshotResponse>(`/money/snapshots/${enc(id)}`),
    take: (input: { date?: string; label?: string }) => post<SnapshotResponse>("/money/snapshots", input),
  },

  rates: {
    list: (query: { from?: string; to?: string; source?: string } = {}) => apiFetch<RateRow[]>("/money/rates", { query }),
    create: (input: { date: string; from: string; to: string; rate: string }) => post<RateRow>("/money/rates", input),
    remove: (id: string) => apiFetch<{ removed: true }>(`/money/rates/${enc(id)}`, { method: "DELETE" }),
  },

  tokens: {
    list: () => apiFetch<ApiToken[]>("/money/tokens"),
    create: (input: { name: string; scope: TokenScope }) => post<CreatedApiToken>("/money/tokens", input),
    revoke: (id: string) => apiFetch<ApiToken>(`/money/tokens/${enc(id)}`, { method: "DELETE" }),
  },

  automation: {
    status: () => apiFetch<AutomationStatus>("/money/automation"),
    run: (task: MoneyTask) => post<AutomationJob>(`/money/automation/${task}`),
  },
};
