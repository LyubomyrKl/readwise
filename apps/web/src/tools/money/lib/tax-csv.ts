import type { TaxReport } from "../types";

const cell = (v: string | null | undefined) => {
  const s = v ?? "";
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The report as CSV for a spreadsheet or the tax adviser: one line per lot sold, then one per dividend or interest. */
export function taxCsv(report: TaxReport): string {
  const lines: string[][] = [
    ["section", "date", "account", "asset", "units", "amount", "currency", "rate", "rate_date", "amount_pln", "cost_pln", "lot_acquired", "lot_rate", "lot_rate_date"],
  ];
  for (const s of report.sales) {
    lines.push(["sale", s.date, s.accountName, s.assetCode, s.units, s.proceeds.value, s.proceeds.currency, s.rate ?? "", s.rateDate ?? "", s.proceedsPln?.value ?? "", s.costPln?.value ?? "", "", "", ""]);
    for (const l of s.lots) {
      lines.push(["lot", s.date, s.accountName, s.assetCode, l.units, l.cost.value, l.cost.currency, "", "", "", l.costPln?.value ?? "", l.acquiredAt, l.rate ?? "", l.rateDate ?? ""]);
    }
  }
  for (const i of report.income) {
    lines.push([i.category.toLowerCase(), i.date, i.accountName, i.assetCode ?? "", "", i.gross.value, i.gross.currency, i.rate ?? "", i.rateDate ?? "", i.grossPln?.value ?? "", "", "", "", ""]);
    if (i.withheld.minor !== "0") {
      lines.push(["tax withheld", i.date, i.accountName, i.assetCode ?? "", "", i.withheld.value, i.withheld.currency, i.rate ?? "", i.rateDate ?? "", i.withheldPln?.value ?? "", "", "", "", ""]);
    }
  }
  return lines.map((l) => l.map(cell).join(",")).join("\n") + "\n";
}
