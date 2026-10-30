"""Small EPUB and PDF files built in memory for the ingest and abridge tests."""
from __future__ import annotations

import io
import zipfile

import pymupdf
from PIL import Image


def png(width: int, height: int, color=(200, 30, 30)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), color).save(out, format="PNG")
    return out.getvalue()


def xhtml(body: str, title: str = "t", epub_type: str = "") -> str:
    kind = f' epub:type="{epub_type}"' if epub_type else ""
    return ('<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
            '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
            f"<head><title>{title}</title></head><body{kind}>{body}</body></html>")


def epub(documents: list[tuple[str, str]], toc: list[tuple[str, str, list]] | None = None,
         images: dict[str, bytes] | None = None, title: str = "A Test Book", author: str = "A. Author",
         language: str = "en", cover: str | None = None, ncx_only: bool = False) -> bytes:
    """documents: [(file name, xhtml)] in spine order; toc: [(title, href, children)]."""
    images = images or {}
    manifest = []
    for index, (name, _) in enumerate(documents):
        manifest.append(f'<item id="d{index}" href="{name}" media-type="application/xhtml+xml"/>')
    for index, name in enumerate(images):
        props = ' properties="cover-image"' if name == cover else ""
        manifest.append(f'<item id="i{index}" href="{name}" media-type="image/png"{props}/>')
    if not ncx_only:
        manifest.append('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
    manifest.append('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
    spine = "".join(f'<itemref idref="d{i}"/>' for i in range(len(documents)))
    opf = (f'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
           f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>{title}</dc:title>'
           f'<dc:creator>{author}</dc:creator><dc:language>{language}</dc:language></metadata>'
           f'<manifest>{"".join(manifest)}</manifest><spine toc="ncx">{spine}</spine></package>')

    def nav_items(entries) -> str:
        return "<ol>" + "".join(f'<li><a href="{href}">{t}</a>{nav_items(kids) if kids else ""}</li>'
                                for t, href, kids in entries) + "</ol>"

    def ncx_points(entries) -> str:
        return "".join(f'<navPoint><navLabel><text>{t}</text></navLabel><content src="{href}"/>'
                       f'{ncx_points(kids)}</navPoint>' for t, href, kids in entries)

    toc = toc or []
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        zf.writestr("META-INF/container.xml",
                    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
                    '</rootfiles></container>')
        zf.writestr("OEBPS/content.opf", opf)
        if not ncx_only:
            zf.writestr("OEBPS/nav.xhtml", xhtml(f'<nav epub:type="toc">{nav_items(toc)}</nav>'))
        zf.writestr("OEBPS/toc.ncx", f'<?xml version="1.0"?><ncx><navMap>{ncx_points(toc)}</navMap></ncx>')
        for name, content in documents:
            zf.writestr(f"OEBPS/{name}", content)
        for name, data in images.items():
            zf.writestr(f"OEBPS/{name}", data)
    return out.getvalue()


def paragraph(n: int, words: int = 60, lang: str = "en") -> str:
    if lang == "ru":
        base = ("Экспедиция вышла из порта в мае и через три недели достигла устья реки, "
                "где капитан Невельской приказал строить зимовье. ")
    elif lang == "uk":
        base = ("Козаки вирушили з Січі навесні й за три тижні дійшли до гирла річки, "
                "де гетьман Хмельницький наказав будувати табір. ")
    else:
        base = ("The committee met in the harbour office in March and decided that the new pier "
                "would be built before the winter storms arrived. ")
    text = (base * (words // len(base.split()) + 1)).split()[:words]
    return f"{n}. " + " ".join(text) + "."


def sample_epub() -> bytes:
    """Cover, copyright, contents, a part with two chapters (a captioned figure, a footnote marker),
    a Russian chapter with a drop cap, notes at the end."""
    images = {"img/cover.png": png(600, 900), "img/map.png": png(800, 500, (20, 90, 160)),
              "img/dropcap.png": png(80, 80, (0, 0, 0)), "img/rule.png": png(900, 20, (90, 90, 90))}
    chapter1 = xhtml('<h2 id="c1">Chapter 1. The Harbour</h2>'
                     + "".join(f"<p>{paragraph(i)}</p>" for i in range(1, 6))
                     + '<p>The pier was finished in May<sup><a href="notes.xhtml#n1" epub:type="noteref">1</a></sup>.</p>'
                     + '<figure><img src="../img/map.png" alt="map of the harbour"/>'
                       '<figcaption>Fig. 1. The harbour in 1890</figcaption></figure>'
                     + "".join(f"<p>{paragraph(i)}</p>" for i in range(6, 9)))
    chapter2 = xhtml('<h2 id="c2">Chapter 2. The Storm</h2><img src="../img/rule.png" alt=""/>'
                     + "".join(f"<p>{paragraph(i)}</p>" for i in range(1, 5)))
    chapter3 = xhtml('<h2>Глава 3. Зимовье</h2><p><img src="../img/dropcap.png" alt="буква Б"/>лагодаря '
                     'капитану зимовье построили быстро.</p>'
                     + "".join(f"<p>{paragraph(i, lang='ru')}</p>" for i in range(1, 4)))
    documents = [
        ("text/cover.xhtml", xhtml('<img src="../img/cover.png" alt="cover"/>', epub_type="cover")),
        ("text/copyright.xhtml", xhtml("<p>Copyright © 2024 A. Author. All rights reserved.</p><p>ISBN 978-0-00-000000-0</p>")),
        ("text/contents.xhtml", xhtml("<h1>Contents</h1><p>Chapter 1</p><p>Chapter 2</p>")),
        ("text/part1.xhtml", xhtml("<h1>Part One</h1>")),
        ("text/ch1.xhtml", chapter1),
        ("text/ch2.xhtml", chapter2),
        ("text/ch3.xhtml", chapter3),
        ("text/notes.xhtml", xhtml('<h1>Notes</h1><aside epub:type="footnote" id="n1"><p>1. A note.</p></aside>')),
    ]
    toc = [("Copyright", "text/copyright.xhtml", []), ("Contents", "text/contents.xhtml", []),
           ("Part One", "text/part1.xhtml", [("Chapter 1. The Harbour", "text/ch1.xhtml#c1", []),
                                              ("Chapter 2. The Storm", "text/ch2.xhtml#c2", [])]),
           ("Глава 3. Зимовье", "text/ch3.xhtml", []), ("Notes", "text/notes.xhtml", [])]
    return epub(documents, toc, images, cover="img/cover.png")


def sample_pdf(scanned_page: bool = False) -> bytes:
    """Running header and page numbers, two chapters with large headings, a hyphenated word,
    a picture with its caption below, and optionally a page that is only a picture (a scan)."""
    pdf = pymupdf.open()
    body = [paragraph(i) for i in range(1, 7)]
    chapters = [("Chapter One", body[:3]), ("Chapter Two", body[3:])]
    page_number = 0
    for title, paragraphs in chapters:
        for half in (0, 1):
            page = pdf.new_page(width=595, height=842)
            page_number += 1
            page.insert_text((60, 30), "A TEST BOOK", fontsize=8)
            page.insert_text((290, 820), str(page_number), fontsize=8)
            y = 90
            if half == 0:
                page.insert_text((60, y), title, fontsize=20)
                y += 40
            for text in paragraphs[half::2] if half else paragraphs[:2]:
                box = pymupdf.Rect(60, y, 535, y + 160)
                page.insert_textbox(box, text, fontsize=10)
                y += 170
            if title == "Chapter Two" and half == 1:
                page.insert_textbox(pymupdf.Rect(60, y, 535, y + 30), "The engineers wrote a long re-", fontsize=10)
                page.insert_textbox(pymupdf.Rect(60, y + 12, 535, y + 40), "port about the storm.", fontsize=10)
                rect = pymupdf.Rect(100, y + 60, 400, y + 260)
                page.insert_image(rect, stream=png(600, 400, (10, 120, 60)))
                page.insert_text((100, y + 280), "Fig. 2. Waves at the pier", fontsize=9)
    if scanned_page:
        page = pdf.new_page(width=595, height=842)
        page.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=png(1190, 1684, (240, 240, 230)))
    out = pdf.tobytes()
    pdf.close()
    return out
