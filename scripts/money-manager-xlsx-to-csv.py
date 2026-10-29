#!/usr/bin/env python3
"""
A money-manager .xlsx export (sheets "Expenses", "Income", "Transfers") as one CSV
the money tool's history import reads (profile "money-manager").

Standard library only. Amounts are taken exactly as the workbook stores them (no
floating point) and must have at most two decimals. The "Amount in default
currency" columns are ignored: the ledger keeps what moved on each account.

    python3 scripts/money-manager-xlsx-to-csv.py export.xlsx export.csv

Output columns: Date;Type;Account;Amount;Currency;To account;To amount;To currency;Category;Note
"""

import csv
import datetime
import sys
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
HEADER = ["Date", "Type", "Account", "Amount", "Currency", "To account", "To amount", "To currency", "Category", "Note"]


def column_index(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def read_sheets(path: str) -> dict[str, list[list[str]]]:
    """Every sheet as rows of raw cell strings (shared strings resolved, numbers as written)."""
    with zipfile.ZipFile(path) as z:
        strings: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                strings.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        sheets: dict[str, list[list[str]]] = {}
        for sheet in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
            target = rels[sheet.get(REL)].lstrip("/")
            target = target if target.startswith("xl/") else f"xl/{target}"
            rows: list[list[str]] = []
            for row in ET.fromstring(z.read(target)).find("m:sheetData", NS):
                cells: dict[int, str] = {}
                for c in row.findall("m:c", NS):
                    v = c.find("m:v", NS)
                    inline = c.find("m:is", NS)
                    if c.get("t") == "s" and v is not None:
                        value = strings[int(v.text)]
                    elif c.get("t") == "inlineStr" and inline is not None:
                        value = "".join(t.text or "" for t in inline.iter(f"{{{NS['m']}}}t"))
                    else:
                        value = v.text if v is not None and v.text is not None else ""
                    cells[column_index(c.get("r"))] = value
                rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
            sheets[sheet.get("name")] = rows
        return sheets


def excel_date(value: str) -> str:
    """An Excel serial date (1900 system) as YYYY-MM-DD; text dates are passed through."""
    try:
        serial = float(value)
    except ValueError:
        return value.strip()[:10]
    return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))).isoformat()


def amount(value: str, where: str) -> str:
    """The amount as written, as a plain decimal with two places; more places is an error, not a rounding."""
    try:
        d = Decimal(value.strip())
    except InvalidOperation:
        raise SystemExit(f"{where}: not a number: {value!r}")
    q = d.quantize(Decimal("0.01"))
    if q != d:
        raise SystemExit(f"{where}: {value} has more than two decimals")
    return f"{abs(q):.2f}"


def by_header(rows: list[list[str]], sheet: str) -> tuple[dict[str, int], list[list[str]]]:
    """Header names -> column, and the data rows below the header (the first row is a title)."""
    for i, row in enumerate(rows[:5]):
        if row and row[0].strip() == "Date and time":
            return {name.strip(): j for j, name in enumerate(row)}, rows[i + 1 :]
    raise SystemExit(f"sheet {sheet}: no header row starting with 'Date and time'")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    sheets = read_sheets(sys.argv[1])
    out: list[list[str]] = []
    counts = {}

    for sheet, kind in (("Expenses", "Expense"), ("Income", "Income")):
        cols, rows = by_header(sheets.get(sheet, []), sheet)
        get = lambda row, name: row[cols[name]].strip() if cols.get(name) is not None and cols[name] < len(row) else ""
        n = 0
        for i, row in enumerate(rows, start=1):
            if not any(cell.strip() for cell in row):
                continue
            where = f"{sheet} row {i}"
            note = get(row, "Comment")
            tags = get(row, "Tags")
            if tags:
                note = f"{note} [{tags}]".strip()
            out.append([
                excel_date(get(row, "Date and time")),
                kind,
                get(row, "Account"),
                amount(get(row, "Amount in account currency"), where),
                get(row, "Account currency").upper(),
                "", "", "",
                get(row, "Category"),
                note,
            ])
            n += 1
        counts[sheet] = n

    cols, rows = by_header(sheets.get("Transfers", []), "Transfers")
    get = lambda row, name: row[cols[name]].strip() if cols.get(name) is not None and cols[name] < len(row) else ""
    n = 0
    for i, row in enumerate(rows, start=1):
        if not any(cell.strip() for cell in row):
            continue
        where = f"Transfers row {i}"
        out_currency = get(row, "Outgoing currency").upper()
        in_currency = get(row, "Incoming currency").upper()
        in_amount = get(row, "Amount in incoming currency")
        out.append([
            excel_date(get(row, "Date and time")),
            "Transfer",
            get(row, "Outgoing"),
            amount(get(row, "Amount in outgoing currency"), where),
            out_currency,
            get(row, "Incoming"),
            amount(in_amount, where) if in_amount else "",
            in_currency if in_currency and in_currency != out_currency else "",
            "",
            get(row, "Comment"),
        ])
        n += 1
    counts["Transfers"] = n

    # oldest first, as an export would list them
    out.sort(key=lambda r: r[0])
    with open(sys.argv[2], "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(HEADER)
        w.writerows(out)
    print(f"{sys.argv[2]}: {len(out)} rows ({', '.join(f'{k} {v}' for k, v in counts.items())})")


if __name__ == "__main__":
    main()
