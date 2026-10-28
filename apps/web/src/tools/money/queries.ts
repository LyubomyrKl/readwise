"use client";

import { useQuery } from "@tanstack/react-query";
import { moneyApi } from "./api";

/** Query keys of the money tool; invalidate by prefix. */
export const moneyKeys = {
  all: ["money"] as const,
  currencies: ["money", "currencies"] as const,
};

export function useCurrencies() {
  return useQuery({ queryKey: moneyKeys.currencies, queryFn: moneyApi.currencies, staleTime: Infinity });
}
