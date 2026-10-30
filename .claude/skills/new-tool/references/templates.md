# Templates for a new tool

Replace `<id>` with the tool id and `<Name>` with its PascalCase name. Each template is the smallest file that works; grow it from there.

## API

`apps/api/src/tools/<id>/<id>.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ThingsController } from './things/things.controller';
import { ThingsService } from './things/things.service';

/** The <id> tool: <one sentence>. Boots without a queue; automation lives in <id>-automation.module.ts. */
@Module({
  controllers: [ThingsController],
  providers: [ThingsService],
  exports: [ThingsService],
})
export class <Name>Module {}
```

With automation (jobs, a scheduler), compose like money:

```ts
// <id>-automation.module.ts
@Module({ imports: [JobsModule, <Name>Module], providers: [<Name>Jobs] })
export class <Name>AutomationModule {}

// <id>-tool.module.ts, the one the registry imports
@Module({ imports: [<Name>Module, <Name>AutomationModule] })
export class <Name>ToolModule {}
```

`apps/api/src/tool-registry.ts`: add the import and the module to `TOOL_MODULES`.

`apps/api/prisma/schema/<id>.prisma`

```prisma
model <Name>Thing {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@map("<id>_thing")
}
```

A relation to `User` needs the back-relation field on `User` in `platform.prisma` (`things <Name>Thing[]`); keep the list there alphabetical.

`apps/api/eslint.config.mjs`: copy `moneyBoundaries` as `<id>Boundaries` with `files: ['src/tools/<id>/**/*.ts']` and the regex `'^@tools/(?!<id>(/|$))'`; add it to the exported array.

Node job handler (automation module):

```ts
@Injectable()
export class <Name>Jobs implements OnModuleInit {
  constructor(private readonly runner: NodeJobRunner, private readonly jobs: JobsService) {}
  onModuleInit() {
    this.runner.registerHandler('<id>.refresh', async (ctx) => this.refresh(ctx.envelope.userId, ctx.payload));
  }
}
```

## Web

`apps/web/src/tools/<id>/routes.ts`

```ts
import { TOOLS_BASE_PATH } from "@platform/routes";

const BASE = `${TOOLS_BASE_PATH}/<id>`;

/** Every URL the <id> tool owns. */
export const <ID>_ROUTES = Object.freeze({
  base: BASE,
  home: BASE,
  thing: (id: string) => `${BASE}/thing/${id}`,
  settings: "/settings/<id>",
} as const);
```

`apps/web/src/tools/<id>/manifest.ts`

```ts
import { Boxes, LayoutDashboard } from "lucide-react";
import type { ToolManifest } from "@platform/shell/ToolManifest";
import { <ID>_ROUTES } from "./routes";

export const <id>Manifest: ToolManifest = {
  id: "<id>",
  name: "<Name>",
  description: "<one sentence for the dashboard card>",
  icon: Boxes,
  nav: [{ title: "Overview", icon: LayoutDashboard, href: <ID>_ROUTES.home }],
  // actionButton: { title: "New thing", href: <ID>_ROUTES.newThing, icon: Plus },
  // settings: [{ title: "<Name>", description: "...", icon: Boxes, href: <ID>_ROUTES.settings }],
};
```

`apps/web/src/tools/<id>/api.ts`

```ts
import { apiFetch } from "@platform/api/http";
import type { Thing, CreateThingDto } from "./types";

const enc = encodeURIComponent;

export const <id>Api = {
  things: {
    list: () => apiFetch<Thing[]>("/<id>/things"),
    get: (id: string) => apiFetch<Thing>(`/<id>/things/${enc(id)}`),
    create: (dto: CreateThingDto) => apiFetch<Thing>("/<id>/things", { method: "POST", json: dto }),
  },
};
```

`apps/web/src/tools/<id>/queries.ts`

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { <id>Api } from "./api";

export const <id>Keys = {
  all: ["<id>"] as const,
  things: ["<id>", "things"] as const,
  thing: (id: string) => ["<id>", "thing", id] as const,
};

export function useThings() {
  return useQuery({ queryKey: <id>Keys.things, queryFn: <id>Api.things.list });
}

export function useCreateThing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: <id>Api.things.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: <id>Keys.all }),
  });
}
```

`apps/web/src/platform/shell/registry.ts`: import the manifest, append it to `ALL_TOOLS`.

Route files, one line each:

```ts
// apps/web/app/(shell)/apps/<id>/page.tsx
export { default } from "@tools/<id>/pages/HomePage";
```

```tsx
// apps/web/app/(shell)/apps/<id>/layout.tsx, only with a shared layout
import type { ReactNode } from "react";
import { <Name>ToolLayout } from "@tools/<id>/<Name>ToolLayout";

export default function Layout({ children }: { children: ReactNode }) {
  return <<Name>ToolLayout>{children}</<Name>ToolLayout>;
}
```

`apps/web/eslint.config.mjs`: copy the reader block (`files: ["src/tools/reader/**/*.{ts,tsx}"]`) with the id replaced in `files` and in the regex `"^@tools/(?!<id>(/|$))"`.

## Python handler

`apps/workers/worker/tools/<id>/handlers.py`

```python
"""The <id> tool's job handlers and queue bindings."""

from worker.platform.jobs import Handler
from worker.platform.settings import WorkerSettings
from worker.platform.storage import S3Storage

TOOL_ID = "<id>"
JOB_REFRESH = "<id>.refresh"
BINDINGS = [f"jobs.{JOB_REFRESH}"]


def build_handlers(settings: WorkerSettings, storage: S3Storage) -> dict[str, Handler]:
    from worker.tools.<id>.refresh import RefreshHandler  # imported here so other tools never load it

    return {JOB_REFRESH: RefreshHandler(settings, storage)}
```

`apps/workers/worker/__main__.py`: one line in `_tools()`: `<id>.TOOL_ID: (<id>.BINDINGS, <id>.build_handlers)`.
