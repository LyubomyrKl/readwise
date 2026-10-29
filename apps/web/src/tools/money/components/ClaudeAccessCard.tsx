"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { moneyApi } from "../api";
import { useApiTokens, useMoneyMutation } from "../queries";
import type { CreatedApiToken } from "../types";
import { Field } from "./Fields";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 font-mono text-xs">{value}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

/** Read-only tokens that let Claude read the ledger. */
export function ClaudeAccessCard() {
  const { data: tokens } = useApiTokens();
  const [name, setName] = useState("Claude");
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const create = useMoneyMutation(() => moneyApi.tokens.create({ name: name.trim() || "Claude", scope: "read" }), { onSuccess: setCreated });
  const revoke = useMoneyMutation((id: string) => moneyApi.tokens.revoke(id), { success: "Revoked; it stops working at once" });
  const mcpUrl = typeof window === "undefined" ? "/api/money/claude/mcp" : `${window.location.origin}/api/money/claude/mcp`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claude</CardTitle>
        <CardDescription>
          Let Claude answer from your live data through its MCP connector, read only. Revoke a token and it stops working at once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid items-end gap-3 sm:grid-cols-[1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(undefined);
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Button type="submit" disabled={create.isPending}>
            <KeyRound className="mr-1 h-4 w-4" /> Create token
          </Button>
        </form>

        {created ? (
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <p className="text-sm">
              Copy the token now; it is not shown again. Give Claude the server URL with the token as its bearer (for Claude Code:{" "}
              <code className="text-xs">claude mcp add --transport http money &lt;url&gt; --header &quot;Authorization: Bearer &lt;token&gt;&quot;</code>).
            </p>
            <CopyLine label="MCP server URL" value={mcpUrl} />
            <CopyLine label="Token" value={created.token} />
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}

        {(tokens ?? []).length > 0 ? (
          <ul className="divide-y rounded-md border text-sm">
            {(tokens ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant="secondary">{t.scope === "draft" ? "Read and propose" : "Read"}</Badge>
                    {t.revokedAt ? <Badge variant="outline">Revoked</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <code>{t.prefix}…</code> · created {when(t.createdAt)} · last used {when(t.lastUsedAt)}
                  </div>
                </div>
                {t.revokedAt ? null : (
                  <Button size="sm" variant="outline" onClick={() => revoke.mutate(t.id)} disabled={revoke.isPending}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
