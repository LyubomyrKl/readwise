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
  init: RequestInit = {}
): Promise<ResOf<M, P>> {
  const def = (ApiRegistry as any)[method][path] as {
    req?: z.ZodTypeAny;
    res: z.ZodTypeAny;
  };

  def.req?.parse(body ?? {});
  const hasBody = method !== "GET" && body !== undefined;

  const r = await fetch(path as string, {
    method: method as string,
    credentials: "include",
    body: hasBody ? JSON.stringify(body) : undefined,
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (r.status === 204) return {} as ResOf<M, P>;

  if (!r.ok) {
    const errorMsg = await safeMsg(r);
    console.error(`API Error [${method} ${String(path)}]:`, errorMsg, 'Status:', r.status);
    throw new Error(errorMsg ?? `Request failed with status code ${r.status}`);
  }

  return def.res.parse(await r.json()) as ResOf<M, P>;
}

async function safeMsg(r: Response): Promise<string | null> {
  try {
    const data = await r.json();
    return data?.message || data?.error || null;
  } catch {
    return null;
  }
}
