"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { moneyApi } from "../api";
import { AccountSelect, Field, SimpleSelect } from "../components/Fields";
import { EmptyState, MoneyPage, PageHeader } from "../components/PageHeader";
import { formatDate } from "../lib/format";
import { useImportProfiles, useImports, useMoneyMutation } from "../queries";
import { MONEY_ROUTES } from "../routes";

/** Upload an export or a statement; nothing is posted until the review is committed. */
export default function ImportsPage() {
  const router = useRouter();
  const { data: profiles } = useImportProfiles();
  const { data: batches } = useImports();
  const [profile, setProfile] = useState("money-manager");
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const selected = profiles?.find((p) => p.id === profile);

  const upload = useMoneyMutation(() => moneyApi.imports.upload(file!, profile, selected?.needsAccount ? accountId : undefined), {
    onSuccess: (batch) => router.push(MONEY_ROUTES.importBatch(batch.id)),
  });

  return (
    <MoneyPage>
      <PageHeader
        icon={FileUp}
        title="Import"
        description="Your money-manager history, bank statements and broker reports. Rows seen before are recognised."
      />

      <Card>
        <CardHeader>
          <CardTitle>New import</CardTitle>
          <CardDescription>CSV files; Polish bank encodings are read as they are.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (file) upload.mutate(undefined);
            }}
          >
            <Field label="Format">
              <SimpleSelect
                value={profile}
                onChange={setProfile}
                options={(profiles ?? [{ id: "money-manager", label: "Money-manager export" }]).map((p) => ({ value: p.id, label: p.label }))}
              />
            </Field>
            {selected?.needsAccount ? (
              <Field label="Account" hint="The account this statement belongs to">
                <AccountSelect value={accountId} onChange={setAccountId} />
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
            <Field label="File" htmlFor="import-file">
              <Input id="import-file" type="file" accept=".csv,text/csv,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <div className="flex items-end justify-end">
              <Button type="submit" disabled={!file || upload.isPending || (selected?.needsAccount && !accountId)}>
                <Upload className="mr-1 h-4 w-4" />
                {upload.isPending ? "Reading…" : "Upload and review"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Imports</h2>
        {(batches ?? []).length === 0 ? (
          <EmptyState title="No imports yet" />
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {(batches ?? []).map((b) => (
              <li key={b.id}>
                <Link href={MONEY_ROUTES.importBatch(b.id)} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-muted/50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{b.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {profiles?.find((p) => p.id === b.profile)?.label ?? b.profile} · {formatDate(b.createdAt.slice(0, 10))} ·{" "}
                      {b.rowCount} lines
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {b.counts.imported ? <Badge variant="secondary">{b.counts.imported} imported</Badge> : null}
                    <Badge variant={b.status === "committed" ? "default" : "outline"}>
                      {b.status === "committed" ? "Committed" : "In review"}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </MoneyPage>
  );
}
