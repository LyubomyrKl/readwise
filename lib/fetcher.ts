import type {
  CreateBookDto,
  FinalizeBookDto,
  FinalizeCoverDto,
  PresignedUploadDto,
  CoverUpdateDto,
  UpdateSpentTimeDto,
  LoginDto,
  RegisterDto,
  RequestSummaryDto,
  GetSummaryDto,
  FinalizeResponse,
  AuthBundle,
  Tokens,
  SummaryRequestResponse,
} from "@satoru-satoshi/summarize-api-sdk";
import type { BookResponse, TransformedPresignRes, TransformedCoverPresignRes } from "@/app/api/books/schemas";
import type { SummaryResponse } from "@/app/api/summarizer/schemas";

// API Registry mapping paths to request/response types
type ApiRegistry = {
  GET: {
    "/api/books": { req: undefined; res: BookResponse[] };
    "/api/books/[id]": { req: undefined; res: { data: BookResponse } };
    "/api/auth/me": { req: undefined; res: AuthBundle };
  };
  POST: {
    "/api/books/createBookAndPresign": { req: CreateBookDto; res: TransformedPresignRes };
    "/api/books/finalize": { req: FinalizeBookDto; res: FinalizeResponse };
    "/api/books/finalizeCover": { req: FinalizeCoverDto; res: FinalizeResponse };
    "/api/books/coverPresign": { req: PresignedUploadDto & { bookId?: string }; res: TransformedCoverPresignRes };
    "/api/books/updateCoverFinalize": { req: CoverUpdateDto; res: FinalizeResponse };
    "/api/books/updateSpentTime": { req: UpdateSpentTimeDto; res: { status: string } };
    "/api/auth/login": { req: LoginDto; res: AuthBundle };
    "/api/auth/register": { req: RegisterDto; res: AuthBundle };
    "/api/auth/refresh": { req: object; res: Tokens };
    "/api/auth/logout": { req: object; res: void };
    "/api/summarizer": { req: RequestSummaryDto; res: SummaryRequestResponse };
    "/api/summarizer/get-summary": { req: GetSummaryDto; res: SummaryResponse };
  };
};

type Methods = keyof ApiRegistry;
type Paths<M extends Methods> = keyof ApiRegistry[M];
type DefOf<M extends Methods, P extends Paths<M>> = ApiRegistry[M][P];

type ReqOf<M extends Methods, P extends Paths<M>> = DefOf<M, P> extends { req: infer R }
  ? R
  : never;

type ResOf<M extends Methods, P extends Paths<M>> = DefOf<M, P> extends { res: infer R }
  ? R
  : never;

export async function apiFetch<M extends Methods, P extends Paths<M>>(
  method: M,
  path: P,
  body?: ReqOf<M, P>,
  init: RequestInit = {}
): Promise<ResOf<M, P>> {
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
    console.error(`API Error [${method} ${String(path)}]:`, errorMsg, "Status:", r.status);
    throw new Error(errorMsg ?? `Request failed with status code ${r.status}`);
  }

  return (await r.json()) as ResOf<M, P>;
}

async function safeMsg(r: Response): Promise<string | null> {
  try {
    const data = await r.json();
    return data?.message || data?.error || null;
  } catch {
    return null;
  }
}
