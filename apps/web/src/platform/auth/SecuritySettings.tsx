"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { KeyRound, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@platform/api/http";
import type { SecondFactorStatus, TotpSetup } from "@platform/api/types";

const KEY = ["platform", "second-factor"] as const;

const securityApi = {
  status: () => apiFetch<SecondFactorStatus>("/auth/second-factor"),
  startTotp: () => apiFetch<TotpSetup>("/auth/totp/setup", { method: "POST" }),
  enableTotp: (code: string) => apiFetch("/auth/totp/enable", { method: "POST", json: { code } }),
  disableTotp: (code: string) => apiFetch("/auth/totp/disable", { method: "POST", json: { code } }),
  passkeyOptions: () =>
    apiFetch<PublicKeyCredentialCreationOptionsJSON>("/auth/passkeys/register/options", { method: "POST" }),
  savePasskey: (response: unknown, name?: string) =>
    apiFetch("/auth/passkeys/register", { method: "POST", json: { response, name } }),
  removePasskey: (id: string) => apiFetch(`/auth/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** Authenticator app (second factor for the password) and passkeys. */
export function SecuritySettings() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({ queryKey: KEY, queryFn: securityApi.status });
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const start = useMutation({
    mutationFn: securityApi.startTotp,
    onSuccess: (data) => setSetup(data),
    onError: (e) => toast.error(errorText(e)),
  });
  const enable = useMutation({
    mutationFn: () => securityApi.enableTotp(code),
    onSuccess: () => {
      toast.success("Authenticator app is on");
      setSetup(null);
      setCode("");
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const disable = useMutation({
    mutationFn: () => securityApi.disableTotp(disableCode),
    onSuccess: () => {
      toast.success("Authenticator app is off");
      setDisableCode("");
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const addPasskey = useMutation({
    mutationFn: async () => {
      const optionsJSON = await securityApi.passkeyOptions();
      const response = await startRegistration({ optionsJSON });
      return securityApi.savePasskey(response, passkeyName || undefined);
    },
    onSuccess: () => {
      toast.success("Passkey saved");
      setPasskeyName("");
      void refresh();
    },
    onError: (e) =>
      toast.error(e instanceof Error && e.name === "NotAllowedError" ? "Passkey creation was cancelled" : errorText(e)),
  });
  const removePasskey = useMutation({
    mutationFn: securityApi.removePasskey,
    onSuccess: () => {
      toast.success("Passkey removed");
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Sign-in security
        </CardTitle>
        <CardDescription>
          A passkey signs you in on its own. With the authenticator app on, a password also needs a six-digit code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Smartphone className="h-4 w-4" />
              Authenticator app
            </div>
            {isLoading ? null : status?.totpEnabled ? <Badge>On</Badge> : <Badge variant="secondary">Off</Badge>}
          </div>

          {status?.totpEnabled ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="totp-disable">Current code to turn it off</Label>
                <Input
                  id="totp-disable"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123 456"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={() => disable.mutate()} disabled={disable.isPending || !disableCode}>
                Turn off
              </Button>
            </div>
          ) : setup ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Scan the code with your authenticator app (or open the link on your phone), then enter the six digits
                it shows.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <img src={setup.qrDataUrl} alt="Authenticator QR code" className="h-40 w-40 rounded-md border bg-white p-1" />
                <div className="space-y-2 text-sm min-w-0">
                  <div>
                    <span className="text-muted-foreground">Secret: </span>
                    <code className="break-all">{setup.secret}</code>
                  </div>
                  <a className="underline underline-offset-4 break-all" href={setup.otpauthUrl}>
                    Open in authenticator app
                  </a>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="totp-code">Code from the app</Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123 456"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <Button onClick={() => enable.mutate()} disabled={enable.isPending || !code}>
                  Turn on
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => start.mutate()} disabled={start.isPending}>
              Set up the authenticator app
            </Button>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 font-medium text-sm">
            <KeyRound className="h-4 w-4" />
            Passkeys
          </div>
          {status && status.passkeys.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {status.passkeys.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{p.name || "Passkey"}</div>
                    <div className="text-xs text-muted-foreground">
                      Added {new Date(p.createdAt).toLocaleDateString()}
                      {p.lastUsedAt ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove passkey"
                    onClick={() => removePasskey.mutate(p.id)}
                    disabled={removePasskey.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No passkeys yet.</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="passkey-name">Name (optional)</Label>
              <Input
                id="passkey-name"
                placeholder="Phone, laptop…"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => addPasskey.mutate()} disabled={addPasskey.isPending}>
              Add a passkey
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
