// Refresh lock to prevent concurrent refresh attempts
let refreshPromise: Promise<boolean> | null = null;

async function refreshTokenOnce(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshResponse = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      return refreshResponse.ok;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

import type {
  UpdateSpentTimeDto,
  SetBookToFavoriteDto,
  UpdateLastAccessedDto,
  UpdateReadingPositionDto,
  CreateHighlightDto,
  UpdateHighlightDto,
  CreateNoteDto,
  UpdateNoteDto,
  HighlightResponse,
  NoteResponse,
  LoginDto,
  RegisterDto,
  RequestSummaryDto,
  GetSummaryDto,
  AuthBundle,
  Tokens,
  SummaryRequestResponse,
  SummaryStatusResponse,
  CreateLearningNoteDto,
  UpdateLearningNoteDto,
  ValidateNoteDto,
  SubmitReviewDto,
  EndSessionDto,
  UpdateSettingsDto,
  ValidationResultResponse,
  LearningNoteResponse,
  StudyQueueResponse,
  SessionStartResponse,
  ReviewResultResponse,
  StatsResponse,
  DailyStatsResponse,
  SettingsResponse,
  CreateDictionaryEntryDto,
  UpdateDictionaryEntryDto,
  CreateCollocationDto,
  DictionaryEntryResponse,
  DictionaryStatsResponse,
  DictionarySearchResult,
  CollocationResponse,
} from "@/lib/types";
import type { BookResponse } from "@/app/api/books/schemas";
import type { SummaryResponse } from "@/app/api/summarizer/schemas";

// API Registry mapping paths to request/response types
type ApiRegistry = {
  GET: {
    "/api/books": { req: undefined; res: BookResponse[] };
    "/api/books/[id]": { req: undefined; res: { data: BookResponse } };
    "/api/books/[id]/highlights": { req: undefined; res: HighlightResponse[] };
    "/api/books/[id]/notes": { req: undefined; res: NoteResponse[] };
    "/api/auth/me": { req: undefined; res: AuthBundle };
    // Learning endpoints
    "/api/learning/notes": { req: undefined; res: LearningNoteResponse[] };
    "/api/learning/notes/[id]": { req: undefined; res: LearningNoteResponse };
    "/api/learning/study/queue": { req: undefined; res: StudyQueueResponse };
    "/api/learning/stats": { req: undefined; res: StatsResponse };
    "/api/learning/stats/daily": { req: undefined; res: DailyStatsResponse[] };
    "/api/learning/settings": { req: undefined; res: SettingsResponse };
    // Dictionary endpoints
    "/api/dictionary/entries": { req: undefined; res: DictionaryEntryResponse[] };
    "/api/dictionary/entries/[id]": { req: undefined; res: DictionaryEntryResponse };
    "/api/dictionary/stats": { req: undefined; res: DictionaryStatsResponse };
    "/api/dictionary/search": { req: undefined; res: DictionarySearchResult[] };
    // Summarizer endpoints
    "/api/summarizer/status/[bookId]": { req: undefined; res: SummaryStatusResponse };
  };
  DELETE: {
    "/api/books/[id]": { req: undefined; res: { status: string } };
    "/api/highlights/[id]": { req: undefined; res: { status: string } };
    "/api/notes/[id]": { req: undefined; res: { status: string } };
    "/api/learning/notes/[id]": { req: undefined; res: { status: string } };
    "/api/dictionary/entries/[id]": { req: undefined; res: { status: string } };
    "/api/dictionary/entries/[id]/collocations/[collocationId]": { req: undefined; res: { status: string } };
  };
  POST: {
    "/api/books/updateSpentTime": { req: UpdateSpentTimeDto; res: { status: string } };
    "/api/books/setBookToFavorite": { req: SetBookToFavoriteDto; res: { bookId: string; status: string } };
    "/api/books/updateLastAccessed": { req: UpdateLastAccessedDto; res: { status: string } };
    "/api/books/readingPosition": { req: UpdateReadingPositionDto; res: { status: string } };
    "/api/books/[id]/highlights": { req: CreateHighlightDto; res: HighlightResponse };
    "/api/books/[id]/notes": { req: CreateNoteDto; res: NoteResponse };
    "/api/auth/login": { req: LoginDto; res: AuthBundle };
    "/api/auth/register": { req: RegisterDto; res: AuthBundle };
    "/api/auth/refresh": { req: object; res: Tokens };
    "/api/auth/logout": { req: object; res: void };
    "/api/summarizer": { req: RequestSummaryDto; res: SummaryRequestResponse };
    "/api/summarizer/get-summary": { req: GetSummaryDto; res: SummaryResponse };
    // Learning endpoints
    "/api/learning/notes": { req: CreateLearningNoteDto; res: LearningNoteResponse };
    "/api/learning/notes/validate": { req: ValidateNoteDto; res: ValidationResultResponse };
    "/api/learning/notes/from-highlight/[highlightId]": { req: CreateLearningNoteDto; res: LearningNoteResponse };
    "/api/learning/study/session/start": { req: object; res: SessionStartResponse };
    "/api/learning/study/session/end": { req: EndSessionDto; res: { status: string } };
    "/api/learning/study/review": { req: SubmitReviewDto; res: ReviewResultResponse };
    // Dictionary endpoints
    "/api/dictionary/entries": { req: CreateDictionaryEntryDto; res: DictionaryEntryResponse };
    "/api/dictionary/entries/[id]/collocations": { req: CreateCollocationDto; res: CollocationResponse };
    "/api/dictionary/entries/[id]/create-cards": { req: object; res: LearningNoteResponse };
  };
  PATCH: {
    "/api/highlights/[id]": { req: UpdateHighlightDto; res: HighlightResponse };
    "/api/notes/[id]": { req: UpdateNoteDto; res: NoteResponse };
    "/api/learning/notes/[id]": { req: UpdateLearningNoteDto; res: LearningNoteResponse };
    "/api/learning/settings": { req: UpdateSettingsDto; res: SettingsResponse };
    "/api/dictionary/entries/[id]": { req: UpdateDictionaryEntryDto; res: DictionaryEntryResponse };
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

// Extract path parameters like [id] from path strings
type ExtractParams<T extends string> = T extends `${string}[${infer Param}]${infer Rest}`
  ? Param | ExtractParams<Rest>
  : never;

// If path has params, require them; otherwise params is optional/undefined
type PathParams<P extends string> = ExtractParams<P> extends never
  ? undefined
  : Record<ExtractParams<P>, string>;

export async function apiFetch<M extends Methods, P extends Paths<M>>(
  method: M,
  path: P,
  body?: ReqOf<M, P>,
  params?: PathParams<P & string>,
  init: RequestInit = {}
): Promise<ResOf<M, P>> {
  const hasBody = method !== "GET" && body !== undefined;

  // Replace [param] placeholders with actual values
  let resolvedPath = path as string;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      resolvedPath = resolvedPath.replace(`[${key}]`, value as string);
    }
  }

  const r = await fetch(resolvedPath, {
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

  // Handle 401 Unauthorized - try to refresh token first
  if (r.status === 401) {
    if (typeof window !== "undefined") {
      try {
        const refreshed = await refreshTokenOnce();

        if (refreshed) {
          // Retry the original request with new token
          const retryResponse = await fetch(resolvedPath, {
            method: method as string,
            credentials: "include",
            body: hasBody ? JSON.stringify(body) : undefined,
            headers: {
              ...(hasBody ? { "content-type": "application/json" } : {}),
              ...(init.headers ?? {}),
            },
            ...init,
          });

          if (retryResponse.status === 204) return {} as ResOf<M, P>;
          if (retryResponse.ok) {
            return (await retryResponse.json()) as ResOf<M, P>;
          }
        }

        // Refresh failed or retry failed - redirect to login
        const currentPath = window.location.pathname;
        window.location.href = `/auth/login?next=${encodeURIComponent(currentPath)}`;
      } catch {
        const currentPath = window.location.pathname;
        window.location.href = `/auth/login?next=${encodeURIComponent(currentPath)}`;
      }
    }
    throw new Error("Unauthorized");
  }

  if (!r.ok) {
    const errorMsg = await safeMsg(r);
    console.error(`API Error [${method} ${resolvedPath}]:`, errorMsg, "Status:", r.status);
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
