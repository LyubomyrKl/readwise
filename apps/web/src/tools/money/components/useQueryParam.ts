"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A view setting kept in the URL (base currency, tab, range), so a reload or a shared link shows the same view. */
export function useQueryParam<T extends string>(name: string, fallback: T): [T, (value: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = (params.get(name) as T | null) ?? fallback;
  const set = useCallback(
    (next: T) => {
      const query = new URLSearchParams(params.toString());
      if (!next || next === fallback) query.delete(name);
      else query.set(name, next);
      const qs = query.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, name, fallback]
  );
  return [value, set];
}
