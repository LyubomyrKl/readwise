"""reader.ingest: structure from the file itself, pictures kept with their captions, stored once per file."""
import hashlib
import json

import pytest

from books import epub, paragraph, png, sample_epub, sample_pdf, xhtml
from conftest import make_envelope
from worker.platform.jobs import JobFailed
from worker.tools.reader.ingest.classify import kind_of
from worker.tools.reader.ingest.epub_reader import read_epub
from worker.tools.reader.ingest.handler import IngestHandler, sniff_mime
from worker.tools.reader.ingest.ir import SKIP_KINDS, Document, ir_key, structure_key
from worker.tools.reader.ingest.language import detect_language
from worker.tools.reader.ingest.pdf_reader import read_pdf


def _section(doc: Document, title_start: str):
    return next(s for s in doc.sections if s.title.startswith(title_start))


def test_epub_sections_come_from_the_books_own_contents_with_kinds():
    doc = read_epub(sample_epub(), sha256="abc")

    assert doc.structure_source == "toc"
    assert [(s.title, s.level, s.kind) for s in doc.sections] == [
        ("A Test Book", 1, "front"),
        ("Copyright", 1, "copyright"),
        ("Contents", 1, "toc"),
        ("Part One", 1, "part"),
        ("Chapter 1. The Harbour", 2, "chapter"),
        ("Chapter 2. The Storm", 2, "chapter"),
        ("Глава 3. Зимовье", 1, "chapter"),
        ("Notes", 1, "notes"),
    ]
    part = _section(doc, "Part One")
    assert part.end == _section(doc, "Глава 3").start          # a part spans its chapters
    assert _section(doc, "Chapter 1").words > 300
    assert doc.title == "A Test Book" and doc.authors == ["A. Author"]


def test_epub_pictures_keep_captions_drop_caps_go_back_into_the_text_and_ornaments_are_marked():
    doc = read_epub(sample_epub(), sha256="abc")
    figures = {f.alt or f.reason: f for f in doc.figures.values()}

    assert figures["map of the harbour"].caption == "Fig. 1. The harbour in 1890"
    assert not figures["map of the harbour"].decorative
    assert figures["буква Б"].decorative and figures["буква Б"].reason == "drop-cap"
    assert any(b.text.startswith("Благодаря капитану") for b in doc.blocks)
    assert doc.figures[doc.cover].reason == "cover"
    rule = next(f for f in doc.figures.values() if f.width == 900 and f.height == 20)
    assert rule.decorative and rule.reason == "rule"
    assert _section(doc, "Chapter 1").figures == 1               # only informative pictures count
    assert not any(b.text == "Fig. 1. The harbour in 1890" for b in doc.blocks)   # not duplicated as text


def test_epub_note_markers_and_note_bodies_are_not_text():
    doc = read_epub(sample_epub(), sha256="abc")
    texts = [b.text for b in doc.blocks]

    assert "The pier was finished in May." in texts
    assert not any("A note." in t for t in texts)


def test_epub_without_contents_falls_back_to_headings_then_documents():
    documents = [(f"c{i}.xhtml", xhtml(f"<h2>Story {i}</h2>" + "".join(f"<p>{paragraph(j)}</p>" for j in range(3))))
                 for i in range(1, 4)]
    doc = read_epub(epub(documents, toc=[]), sha256="x")
    assert doc.structure_source == "headings"
    assert [s.title for s in doc.sections] == ["Story 1", "Story 2", "Story 3"]

    plain = [(f"c{i}.xhtml", xhtml("".join(f"<p>{paragraph(j)}</p>" for j in range(3)))) for i in range(1, 4)]
    doc = read_epub(epub(plain, toc=[]), sha256="x")
    assert doc.structure_source == "documents" and len(doc.sections) == 3


def test_epub2_ncx_contents_are_read_when_there_is_no_nav_document():
    documents = [(f"c{i}.xhtml", xhtml("".join(f"<p>{paragraph(j)}</p>" for j in range(3)))) for i in range(1, 4)]
    toc = [(f"Chapter {i}", f"c{i}.xhtml", []) for i in range(1, 4)]
    doc = read_epub(epub(documents, toc, ncx_only=True), sha256="x")
    assert doc.structure_source == "toc" and [s.title for s in doc.sections] == ["Chapter 1", "Chapter 2", "Chapter 3"]


def test_ir_round_trips_through_its_stored_form():
    doc = read_epub(sample_epub(), sha256="abc")
    again = Document.loads(doc.dumps())

    assert again.to_json() == doc.to_json()
    assert again.figures[doc.cover].data == b""          # bytes live in their own objects
    assert again.structure()["sections"][3] == {"id": "s3", "title": "Part One", "level": 1, "kind": "part",
                                                "words": doc.sections[3].words, "figures": 1, "included": True,
                                                "href": doc.blocks[doc.sections[3].start].href}


def test_structure_says_where_each_section_starts_in_the_file():
    pdf = read_pdf(sample_pdf(), sha256="pdf")
    assert [(s["title"], s["page"], s["pageLabel"]) for s in pdf.structure()["sections"]] == \
        [("Chapter One", 1, "1"), ("Chapter Two", 3, "3")]

    book = read_epub(sample_epub(), sha256="abc")
    hrefs = [s.get("href") for s in book.structure()["sections"]]
    assert all(h and h.endswith(".xhtml") for h in hrefs) and "page" not in book.structure()["sections"][0]


def test_pdf_page_labels_are_kept_when_the_file_defines_them():
    labelled = read_pdf(sample_pdf(page_labels=True), sha256="pdf")
    assert labelled.page_labels == ["i", "ii", "1", "2"]
    assert [s["pageLabel"] for s in labelled.structure()["sections"]] == ["i", "1"]
    assert Document.loads(labelled.dumps()).page_labels == ["i", "ii", "1", "2"]
    assert read_pdf(sample_pdf(), sha256="pdf").page_labels == []


def test_pdf_headings_by_font_running_heads_removed_hyphens_joined_figure_captioned():
    doc = read_pdf(sample_pdf(), sha256="pdf")
    texts = [b.text for b in doc.blocks if b.type != "figure"]

    assert doc.structure_source == "headings"
    assert [s.title for s in doc.sections] == ["Chapter One", "Chapter Two"]
    assert not any(t == "A TEST BOOK" or t.isdigit() for t in texts)
    assert any("long report about the storm." in t for t in texts)
    figure = next(f for f in doc.figures.values())
    assert figure.caption == "Fig. 2. Waves at the pier" and not figure.decorative
    assert "Fig. 2. Waves at the pier" not in texts
    assert doc.language == "en" and doc.pages == 4


def test_pdf_page_without_text_is_listed_for_ocr():
    doc = read_pdf(sample_pdf(scanned_page=True), sha256="pdf")
    assert doc.ocr_pages == [5]
    assert not doc.figures or all(f.page != 5 for f in doc.figures.values())


@pytest.mark.parametrize("text, expected", [
    ("The committee met in the harbour and the pier was built in time for the storms of that year.", "en"),
    ("Экспедиция вышла из порта в мае, и через три недели она достигла устья реки, где ещё стоял лёд.", "ru"),
    ("Козаки вирушили з Січі навесні й за три тижні дійшли до гирла річки, де ще стояла крига.", "uk"),
    ("Der Ausschuss tagte im Hafen und beschloss, dass der neue Pier vor dem Winter gebaut wird.", "other"),
])
def test_language_by_letters_and_function_words(text, expected):
    assert detect_language(text * 3) == expected


@pytest.mark.parametrize("title, kind", [
    ("Contents", "toc"), ("Зміст", "toc"), ("Оглавление", "toc"), ("Index", "index"),
    ("Предметный указатель", "index"), ("Bibliography", "bibliography"), ("Список літератури", "bibliography"),
    ("Notes", "notes"), ("Примечания", "notes"), ("Acknowledgments", "acknowledgments"), ("Подяки", "acknowledgments"),
    ("About the Author", "about"), ("Also by Nassim Taleb", "also_by"), ("Chapter 3. Notes from the field", "chapter"),
    ("Appendix B. Tables", "appendix"), ("Introduction", "chapter"), ("Передмова", "chapter"),
])
def test_section_kinds_from_titles(title, kind):
    assert kind_of(title) == kind
    assert (kind in SKIP_KINDS) == (kind not in ("chapter", "appendix"))


def test_sniff_mime_trusts_the_bytes():
    assert sniff_mime(sample_pdf(), "application/octet-stream") == "application/pdf"
    assert sniff_mime(sample_epub(), "application/zip") == "application/epub+zip"


def test_handler_stores_the_ir_pictures_and_structure_once_per_file(settings, storage, make_ctx):
    data = sample_epub()
    storage.store[("books", "user-1-book.epub")] = data
    sha = hashlib.sha256(data).hexdigest()
    payload = {"bookId": "b1", "fileStorageKey": "user-1-book.epub", "mime": "application/epub+zip"}

    result = IngestHandler(settings, storage)(make_ctx(make_envelope(type="reader.ingest", payload=payload)))

    assert result["irStorageKey"] == ir_key(sha) == f"ir/{sha}/ir-v1.json.gz"
    assert result["language"] == "en" and result["chapters"] == 3 and result["structureSource"] == "toc"
    structure = json.loads(storage.store[("extractions", structure_key(sha))])
    assert [s["title"] for s in structure["sections"] if s["included"]] == [
        "Part One", "Chapter 1. The Harbour", "Chapter 2. The Storm", "Глава 3. Зимовье"]
    images = [k for (bucket, k) in storage.store if bucket == "extractions" and "/img/" in k]
    assert len(images) == 4
    stored = Document.loads(storage.store[("extractions", ir_key(sha))])
    assert all(f.key in images for f in stored.figures.values())

    uploads = len(storage.uploads)
    again = IngestHandler(settings, storage)(make_ctx(make_envelope(type="reader.ingest", payload=payload)))
    # the second time only the structure summary is written again, from the stored IR
    assert again["skipped"] is True and len(storage.uploads) == uploads + 1
    refreshed = json.loads(storage.store[("extractions", structure_key(sha))])
    assert all(s.get("href") for s in refreshed["sections"])


def test_handler_rejects_what_it_cannot_read(settings, storage, make_ctx):
    storage.store[("books", "k.txt")] = b"just text"
    payload = {"bookId": "b1", "fileStorageKey": "k.txt", "mime": "text/plain"}
    with pytest.raises(JobFailed) as error:
        IngestHandler(settings, storage)(make_ctx(make_envelope(type="reader.ingest", payload=payload)))
    assert error.value.retryable is False


def test_png_helper_is_a_real_image():
    assert png(10, 10)[:8] == b"\x89PNG\r\n\x1a\n"
