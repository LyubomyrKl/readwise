import type { AmountJson, SnapshotResponse } from "../types";

/**
 * CSV built in the browser. Values are the API's exact strings, never numbers
 * worked out here; the file starts with a UTF-8 BOM so Excel reads ą, є and ł.
 */

export type CsvCell = string | null | undefined;

const BOM = "﻿";

/** One field: quoted when it holds a comma, a quote, a line break or edge spaces. */
export function csvField(value: CsvCell): string {
  const s = value ?? "";
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows as CSV text (RFC 4180, CRLF line ends), with the BOM in front. */
export function toCsv(rows: CsvCell[][]): string {
  return BOM + rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/** Hands the CSV to the browser as a download. */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // after the click has been handled
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const SNAPSHOT_CSV_HEAD = [
  "snapshot date",
  "label",
  "section",
  "name",
  "account or group",
  "code",
  "units",
  "amount",
  "amount currency",
  "value in base currency",
  "base currency",
  "percent",
  "target percent",
];

type Row = {
  section: string;
  name: string;
  group?: string | null;
  code?: string | null;
  units?: string | null;
  amount?: AmountJson | null;
  value?: AmountJson | null;
  percent?: string | null;
  target?: string | null;
};

/** The rows of one full snapshot (with `data`), without the header. */
export function snapshotCsvRows(snapshot: SnapshotResponse): CsvCell[][] {
  const rows: Row[] = [];
  const data = snapshot.data;
  if (!data) {
    rows.push({ section: "net worth", name: "Total", value: snapshot.netWorth });
  } else {
    const nw = data.netWorth;
    rows.push({ section: "net worth", name: "Total", value: nw.total });
    rows.push({ section: "net worth", name: "Assets", value: nw.assets });
    rows.push({ section: "net worth", name: "Liabilities", value: nw.liabilities });
    for (const a of nw.accounts) {
      if (a.items.length === 0) rows.push({ section: "account", name: a.name, group: a.institution, value: a.value });
      for (const i of a.items) {
        rows.push({ section: "account", name: a.name, group: a.institution, code: i.code, units: i.units, amount: i.native, value: i.value });
      }
    }
    for (const c of nw.currencies) rows.push({ section: "currency", name: c.name, code: c.key, amount: c.native, value: c.value });
    for (const t of nw.types) rows.push({ section: "type", name: t.name, code: t.key, amount: t.native, value: t.value });
    for (const p of data.positions) {
      rows.push({ section: "position", name: p.name, group: p.accountName, code: p.code, units: p.units, amount: p.value });
    }
    for (const r of data.allocation.rows) {
      rows.push({ section: "allocation", name: r.name, value: r.value, percent: r.percent, target: r.targetPercent });
    }
  }
  const base = data?.netWorth.base ?? snapshot.netWorth.currency;
  return rows.map((r) => [
    snapshot.date,
    snapshot.label,
    r.section,
    r.name,
    r.group,
    r.code,
    r.units,
    r.amount?.value,
    r.amount?.currency,
    r.value?.value,
    r.value ? r.value.currency || base : null,
    r.percent,
    r.target,
  ]);
}

/** One CSV for any number of full snapshots, oldest first. */
export function snapshotsCsv(snapshots: SnapshotResponse[]): CsvCell[][] {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  return [SNAPSHOT_CSV_HEAD, ...sorted.flatMap(snapshotCsvRows)];
}

export function snapshotFilename(snapshot?: Pick<SnapshotResponse, "date">): string {
  return snapshot ? `workbench-snapshot-${snapshot.date}.csv` : "workbench-snapshots.csv";
}
