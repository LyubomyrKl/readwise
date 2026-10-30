"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { denyUrl, parseAuthorizeRequest, redirectHost } from "../lib/oauth";
import { errorMessage, useOAuthAuthorize } from "../queries";

/**
 * Where claude.ai sends the owner's browser to approve its custom connector (OAuth
 * authorization code with PKCE). Allow asks the API for a code and follows its redirect;
 * Deny goes back to Claude with access_denied. Not in the navigation.
 */
export default function ClaudeConnectPage() {
  const params = useSearchParams();
  const check = useMemo(() => parseAuthorizeRequest(params), [params]);
  const authorize = useOAuthAuthorize();
  const [outcome, setOutcome] = useState<"leaving" | "denied" | null>(null);

  const allow = () => {
    if (!check.ok) return;
    authorize.mutate(check.request, {
      onSuccess: ({ redirect }) => {
        setOutcome("leaving");
        window.location.assign(redirect);
      },
    });
  };

  const deny = () => {
    if (!check.ok) return;
    const url = denyUrl(check.request.redirectUri, check.request.state);
    setOutcome(url ? "leaving" : "denied");
    if (url) window.location.assign(url);
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Claude to Money</CardTitle>
          <CardDescription>
            Claude (claude.ai) asks for read-only access to your money data: balances, transactions, investments and reports. It
            cannot add or change anything. You can revoke it any time in Settings → Claude.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {check.ok ? (
            <p className="text-xs text-muted-foreground">
              Returns to <span className="font-mono">{redirectHost(check.request.redirectUri)}</span>
            </p>
          ) : (
            <p role="alert" className="text-destructive">
              This connection request is not valid: {check.error}
            </p>
          )}
          {authorize.isError ? (
            <p role="alert" className="text-destructive">
              {errorMessage(authorize.error)}
            </p>
          ) : null}
          {outcome === "denied" ? <p role="status">Denied</p> : null}
          {outcome === "leaving" ? <p role="status" className="text-muted-foreground">Returning to Claude…</p> : null}
        </CardContent>
        {check.ok && outcome === null ? (
          <CardFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={deny} disabled={authorize.isPending}>
              Deny
            </Button>
            <Button onClick={allow} disabled={authorize.isPending}>
              Allow
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
