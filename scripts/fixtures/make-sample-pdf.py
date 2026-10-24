#!/usr/bin/env python3
"""Generate fixtures/sample-2p.pdf: a tiny two-page PDF with real, extractable text.

Standard library only. The prose is plain English so pdfplumber extracts it
and the summarizer has sentences to segment. Re-run after editing PAGES:

    python3 scripts/fixtures/make-sample-pdf.py
"""
from pathlib import Path

PAGES = [
    ("Chapter One: The Lighthouse", [
        "Maren took the ferry to the island on the first morning of spring.",
        "The lighthouse keeper had retired in winter, and nobody had replaced him.",
        "She found the logbook open on the desk, its last entry dated the night of the storm.",
        "Every page recorded the same ritual: trim the wick, wind the clockwork, note the wind.",
        "By noon she had cleaned the lens and discovered that the clockwork still turned.",
        "That evening the light swept the bay for the first time in four months.",
    ]),
    ("Chapter Two: The Logbook", [
        "The entries grew shorter toward the end, as if the keeper had been saving ink.",
        "One line mentioned a boat that passed too close to the rocks and never answered the horn.",
        "Maren compared the dates with the harbor records and found the boat had been reported missing.",
        "She wrote her own first entry that night, copying the ritual word for word.",
        "The wind was from the north, the lens was clean, and the light did not fail.",
        "In the morning she radioed the harbor to say the lighthouse was keeping watch again.",
    ]),
]


def _esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _content_stream(title: str, lines: list[str]) -> bytes:
    ops = ["BT", "/F1 16 Tf", "72 720 Td", f"({_esc(title)}) Tj", "/F1 11 Tf", "0 -28 Td", "15 TL"]
    ops += [f"({_esc(line)}) Tj T*" for line in lines]
    ops.append("ET")
    return "\n".join(ops).encode("latin-1")


def build() -> bytes:
    objects: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        7: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    }
    kids = []
    number = 3
    for title, lines in PAGES:
        page_no, content_no = number, number + 1
        kids.append(f"{page_no} 0 R")
        stream = _content_stream(title, lines)
        objects[page_no] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_no} 0 R /Resources << /Font << /F1 7 0 R >> >> >>"
        ).encode("latin-1")
        objects[content_no] = (
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )
        number += 2
    objects[2] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>".encode("latin-1")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: dict[int, int] = {}
    for num in sorted(objects):
        offsets[num] = len(out)
        out += f"{num} 0 obj\n".encode() + objects[num] + b"\nendobj\n"
    xref_pos = len(out)
    size = max(objects) + 1
    out += f"xref\n0 {size}\n".encode()
    out += b"0000000000 65535 f \n"
    for num in range(1, size):
        out += f"{offsets[num]:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    return bytes(out)


if __name__ == "__main__":
    target = Path(__file__).resolve().parent / "sample-2p.pdf"
    target.write_bytes(build())
    print(f"wrote {target} ({target.stat().st_size} bytes)")
