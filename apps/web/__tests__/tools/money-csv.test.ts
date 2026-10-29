import { csvField, snapshotCsvRows, snapshotFilename, snapshotsCsv, SNAPSHOT_CSV_HEAD, toCsv } from "@tools/money/lib/csv";
import type { AmountJson, SnapshotResponse } from "@tools/money/types";

const pln = (value: string): AmountJson => ({ currency: "PLN", value, minor: value.replace(".", "") });
const eur = (value: string): AmountJson => ({ currency: "EUR", value, minor: value.replace(".", "") });

function snapshot(date: string, label: string | null): SnapshotResponse {
  return {
    id: date,
    date,
    label,
    netWorth: pln("1000.10"),
    createdAt: `${date}T23:00:00.000Z`,
    data: {
      netWorth: {
        base: "PLN",
        asOf: date,
        total: pln("1000.10"),
        assets: pln("1100.10"),
        liabilities: pln("-100.00"),
        accounts: [
          {
            accountId: "a1",
            name: "Złoty, \"main\"",
            institution: "mBank",
            type: "bank",
            value: pln("1000.10"),
            items: [{ code: "EUR", kind: "cash", native: eur("234.56"), units: null, value: pln("1000.10"), valuedBy: "balance" }],
          },
        ],
        currencies: [{ key: "EUR", name: "Euro", native: eur("234.56"), value: pln("1000.10") }],
        types: [{ key: "bank", name: "Bank", native: null, value: pln("1000.10") }],
        classes: [],
        missingRates: [],
        rateDate: date,
      },
      allocation: {
        base: "PLN",
        asOf: date,
        total: pln("1000.10"),
        rows: [{ classId: "c1", name: "Cash", value: pln("1000.10"), percent: "100.00", targetPercent: "20.00", drift: "80.00", driftAmount: null }],
        targetsTotal: "20.00",
        missingRates: [],
      },
      positions: [],
    },
  };
}

describe("money CSV", () => {
  it("quotes only what needs it", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("-12.30")).toBe("-12.30");
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(" edge")).toBe('" edge"');
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("starts with a BOM and ends lines with CRLF", () => {
    const text = toCsv([["a", "Łódź"], ["Київ", null]]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1)).toBe("a,Łódź\r\nКиїв,\r\n");
  });

  it("flattens a snapshot into sections with the API's exact strings", () => {
    const rows = snapshotCsvRows(snapshot("2026-09-30", "Q3 2026"));
    expect(rows.every((r) => r.length === SNAPSHOT_CSV_HEAD.length)).toBe(true);
    expect(rows[0]).toEqual(["2026-09-30", "Q3 2026", "net worth", "Total", undefined, undefined, undefined, undefined, undefined, "1000.10", "PLN", undefined, undefined]);
    const account = rows.find((r) => r[2] === "account")!;
    expect(account.slice(3, 11)).toEqual(['Złoty, "main"', "mBank", "EUR", null, "234.56", "EUR", "1000.10", "PLN"]);
    expect(rows.find((r) => r[2] === "allocation")!.slice(11)).toEqual(["100.00", "20.00"]);
    expect(rows.map((r) => r[2])).toEqual(["net worth", "net worth", "net worth", "account", "currency", "type", "allocation"]);
  });

  it("puts several snapshots under one header, oldest first", () => {
    const rows = snapshotsCsv([snapshot("2026-09-30", null), snapshot("2026-06-30", "Q2")]);
    expect(rows[0]).toBe(SNAPSHOT_CSV_HEAD);
    expect(rows[1][0]).toBe("2026-06-30");
    expect(rows[rows.length - 1][0]).toBe("2026-09-30");
    expect(toCsv(rows)).toContain('"Złoty, ""main"""');
  });

  it("names the file after the snapshot", () => {
    expect(snapshotFilename({ date: "2026-10-29" })).toBe("workbench-snapshot-2026-10-29.csv");
    expect(snapshotFilename()).toBe("workbench-snapshots.csv");
  });
});
