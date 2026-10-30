---
name: endpoint
description: Add or change an API endpoint end to end in this repo: the NestJS controller method with @ApiEndpoint and a class-validator DTO in the area's *.models.ts, the service, then the web side (a hand-written type in types.ts, a function in the tool's api.ts over apiFetch, a TanStack Query hook or mutation in queries.ts that invalidates the right keys) and the tests (a unit spec beside the service, an e2e spec with FakePrisma when the flow matters, a web test). Use it whenever the user asks for a new route, endpoint, API call, "expose X", "the page needs Y from the API", a new query or mutation, a field added to a response, or a 400/401 on an existing call, in apps/api or apps/web.
argument-hint: "<METHOD /tool/path>"
---

# Endpoint

The browser never calls the API directly. `apiFetch("/money/categories")` goes to the web proxy at `/api/gw/money/categories`, which adds the token from the cookie, refreshes it when needed and forwards to `API_URL/api/money/categories`. So an endpoint is a controller method in `apps/api` plus a function in the tool's `api.ts`, and whatever uses it. README "How the web app talks to the API" has the detail.

## API side

1. The controller lives in `apps/api/src/tools/<tool>/<area>/<area>.controller.ts`, with `@ApiTags('<tool>')` and `@Controller('<tool>/<area>')`. Each method gets `@ApiEndpoint({ summary, response: Dto | [Dto] })`, which adds the JWT guard and the Swagger entry (`auth: false` only for routes that must be public), and `@Req() req: UserModel` for `req.user.userId`. Every query filters by that id together with the row id, so another user's row reads as 404 and ids are not probeable; 403 is for a caller who is known but not allowed (a read-only token, say). Model: `tools/money/categories/categories.controller.ts`.
2. DTOs and response classes go in `<area>.models.ts`, with `@ApiProperty` and class-validator decorators on every field. The global pipe runs with `whitelist` and `forbidNonWhitelisted`, so a body field without a decorator is rejected with 400, and with `transform`, so declare the types you want. Query parameters arrive as strings; convert them yourself.
3. The service does the work; the controller only translates. In money, writes go through `MovementsService` under `LedgerService.lock` and never touch ledger tables directly; Claude's access (`claude/`) stays read-only except `propose_movement`, which makes drafts. Amounts travel as strings of minor units, quantities as decimal strings, never as JavaScript numbers.
4. Check the shape in Swagger at `/api/docs` with the API running (`npm run dev:api`).

## Web side

1. Mirror the response and the DTO in `apps/web/src/tools/<tool>/types.ts` by hand, same names as the API; there is no generator.
2. One function in `api.ts`: `apiFetch<T>(path, init)` from `@platform/api/http`, whose `init` takes `json` (serialised, content type set) and `query` (an object turned into the query string) besides the fetch options; path parameters through `encodeURIComponent`; file paths the API returns wrapped with `apiUrl` so they go through the proxy.
3. `queries.ts`: a key in the tool's key object, `useQuery` for reads (`enabled` when an id may be missing), and for writes the tool's helper when it has one (`useMoneyMutation` invalidates `moneyKeys.all` and toasts) or `useMutation` with `invalidateQueries` on every key the write makes stale.
4. Pages use the hooks; components never fetch on their own.

## Tests

- A unit spec beside the service (`*.spec.ts`, run by `npm test`), with a small hand-written fake or `FakePrisma` from `apps/api/test/fakes`.
- An e2e spec in `apps/api/test/e2e/*.e2e-spec.ts` boots the tool's module with `FakePrisma`, `FakeQueue`, a storage stub and the JWT guard overridden (model: `summaries.e2e-spec.ts`); extend `FakePrisma` if the model is new to it. Worth it when the endpoint has a flow (jobs, several calls) or a rejection to prove.
- Money ledger behaviour belongs in a DB spec under `apps/api/test/db` through `moneyHarness` (run with `/checks db`); the fakes do not run the triggers.
- Web: `apps/web/__tests__/tools/*.test.ts` for api functions and hooks; components with Testing Library.
- Finish with `/checks`.

## Report

Method and path, request and response shapes, the files touched on each side, and which tests cover it. If the endpoint changes a response other pages use, say which.
