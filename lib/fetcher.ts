// lib/api/fetcher.ts
import { AuthApiRegistry } from "@/app/api/auth/schemas";
import { z } from "zod";

type Methods = keyof typeof AuthApiRegistry;
type Paths<M extends Methods> = keyof NonNullable<(typeof AuthApiRegistry)[M]>;
type DefOf<M extends Methods, P extends Paths<M>> = NonNullable<
  (typeof AuthApiRegistry)[M]
>[P];

type ReqOf<M extends Methods, P extends Paths<M>> = DefOf<M, P> extends {
  req: infer R;
}
  ? R extends z.ZodTypeAny
    ? z.infer<R>
    : undefined
  : never;

type ResOf<M extends Methods, P extends Paths<M>> = DefOf<M, P> extends {
  res: infer R;
}
  ? R extends z.ZodTypeAny
    ? z.infer<R>
    : never
  : never;

export async function apiFetch<M extends Methods, P extends Paths<M>>(
  method: M,
  path: P,
  body?: ReqOf<M, P>,
  init?: RequestInit
): Promise<ResOf<M, P>> {
  // runtime def, narrowed locally
  const def = (AuthApiRegistry as any)[method][path] as {
    req?: z.ZodTypeAny;
    res: z.ZodTypeAny;
  };

  if (def.req) def.req.parse(body ?? {});

  const r = await fetch(path as string, {
    method: method as string,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    ...init,
  });

  if (r.status === 204) {
    return {} as ResOf<M, P>;
  }
  if (!r.ok) throw new Error(`${r.status}`);

  const json = await r.json();
  return def.res.parse(json) as ResOf<M, P>;
}
