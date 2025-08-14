import { ApiRegistry } from "@/app/api/api.types";
import { z } from "zod";

type Methods = keyof typeof ApiRegistry;
type Paths<M extends Methods> = keyof NonNullable<(typeof ApiRegistry)[M]>;
type DefOf<M extends Methods, P extends Paths<M>> = NonNullable<
  (typeof ApiRegistry)[M]
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
  const def = (ApiRegistry as any)[method][path] as {
    req?: z.ZodTypeAny;
    res: z.ZodTypeAny;
  };

  if (def.req) def.req.parse(body ?? {});

  const r = await fetch(path as string, {
    method: method as string,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    credentials: "include",
    ...init,
  });

  if (r.status === 204) {
    return {} as ResOf<M, P>;
  }
  if (!r.ok) {
    const errorMessage = await safeMsg(r);
    throw new Error(errorMessage || "Request failed");
  }

  const json = await r.json();
  return def.res.parse(json) as ResOf<M, P>;
}

async function safeMsg(r: Response): Promise<string | null> {
  try {
    const data = await r.json();
    return data?.message || data?.error || null;
  } catch {
    return null;
  }
}
