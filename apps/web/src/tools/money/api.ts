/**
 * The money tool's typed API. Every function is one API endpoint behind the proxy;
 * adding an endpoint means a controller method in apps/api and a line here.
 */
import { apiFetch } from "@platform/api/http";
import type { CurrencyResponse } from "./types";

export const moneyApi = {
  currencies: () => apiFetch<CurrencyResponse[]>("/money/currencies"),
};
