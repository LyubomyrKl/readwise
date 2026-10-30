"""EPUB -> Document: spine order, the book's own contents (EPUB 3 nav, else EPUB 2 NCX), pictures.

The container is read directly (zip + OPF) rather than through ebooklib, whose reader drops files it
cannot resolve and warns about NCX defaults; only parsing XHTML needs BeautifulSoup. html.parser is
used for XHTML because it treats `<a id="x"/>` as empty, where an HTML parser would wrap the rest of
the chapter in the anchor.
"""

from __future__ import annotations

import io
import posixpath
import re
import warnings
import zipfile
from typing import Optional
from urllib.parse import unquote

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
from bs4.builder import XMLParsedAsHTMLWarning

from worker.tools.reader.ingest import figures as figure_rules
from worker.tools.reader.ingest.classify import normalize_title
from worker.tools.reader.ingest.ir import Block, Document, Figure, Section, count_words
from worker.tools.reader.ingest.language import detect_language
from worker.tools.reader.ingest.structure import equal_parts, finalize_sections, sections_from_headings

HEADINGS = {f"h{i}": i for i in range(1, 7)}
SKIP_TAGS = {"script", "style", "head", "title", "meta", "link", "noscript", "template", "nav"}
TEXT_TAGS = {"p": "paragraph", "li": "item", "dd": "paragraph", "dt": "paragraph", "pre": "pre",
             "address": "paragraph", "figcaption": "paragraph", "caption": "paragraph"}
CONTAINERS = {"html", "body", "div", "section", "article", "main", "header", "footer", "aside", "ul", "ol",
              "dl", "figure", "center", "blockquote", "hgroup", "details", "summary", "form", "fieldset"}
BLOCK_LEVEL = set(HEADINGS) | set(TEXT_TAGS) | CONTAINERS | {"table", "hr"}
NOTE_TYPES = {"footnote", "endnote", "rearnote", "note", "footnotes", "endnotes", "rearnotes"}
NOTE_MARKER = re.compile(r"^\s*[\[(]?[\d*†‡§¹²³⁴⁵⁶⁷⁸⁹⁰ivxIVX]{1,4}[\])]?\s*$")
CAPTION = re.compile(r"^\s*(fig\.|figure|plate|table|map|chart|diagram|illustration|рис\.|рисунок|илл\.|иллюстрация"
                     r"|табл\.|таблица|схема|карта|мал\.|малюнок|ілюстрація|таблиця|діаграма)\s*[\dIVXLCА-Я]", re.I)
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)  # XHTML on purpose, see the module doc


def _epub_type(tag: Tag) -> str:
    return " ".join(str(tag.get(name, "")) for name in ("epub:type", "type", "role")
                    if isinstance(tag.get(name), str)).lower()


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("­", "")).strip()


class _Container:
    """The zip, its OPF: manifest, spine, metadata, contents."""

    def __init__(self, data: bytes):
        self.zip = zipfile.ZipFile(io.BytesIO(data))
        self.names = set(self.zip.namelist())
        container = self.zip.read("META-INF/container.xml").decode("utf-8", "replace")
        match = re.search(r'full-path\s*=\s*"([^"]+)"', container)
        if not match:
            raise ValueError("EPUB without a package document (META-INF/container.xml names none)")
        self.opf_path = unquote(match.group(1))
        self.opf_dir = posixpath.dirname(self.opf_path)
        opf = BeautifulSoup(self.zip.read(self.opf_path), "html.parser")
        self.manifest: dict[str, dict] = {}
        for item in opf.find_all("item"):
            href = item.get("href")
            if not href:
                continue
            self.manifest[item.get("id", href)] = {
                "path": self.resolve(self.opf_path, href),
                "media_type": (item.get("media-type") or "").lower(),
                "properties": (item.get("properties") or "").lower().split(),
            }
        spine = opf.find("spine")
        self.spine = [self.manifest[ref["idref"]]["path"] for ref in (spine.find_all("itemref") if spine else [])
                      if ref.get("idref") in self.manifest]
        self.ncx_id = spine.get("toc") if spine else None
        self.title = _clean(opf.find("dc:title").get_text()) if opf.find("dc:title") else ""
        self.authors = [_clean(c.get_text()) for c in opf.find_all("dc:creator") if _clean(c.get_text())]
        cover_meta = opf.find("meta", attrs={"name": "cover"})
        cover_id = cover_meta.get("content") if cover_meta else None
        self.cover_path = next((m["path"] for m in self.manifest.values() if "cover-image" in m["properties"]),
                               self.manifest.get(cover_id or "", {}).get("path"))
        self.guide = {self.resolve(self.opf_path, ref.get("href", "")).split("#")[0]: ref.get("type", "").lower()
                      for ref in opf.find_all("reference") if ref.get("href")}

    def resolve(self, base_path: str, href: str) -> str:
        href = unquote(href.strip())
        path, _, fragment = href.partition("#")
        joined = posixpath.normpath(posixpath.join(posixpath.dirname(base_path), path)) if path else base_path
        return f"{joined}#{fragment}" if fragment else joined

    def read(self, path: str) -> Optional[bytes]:
        return self.zip.read(path) if path in self.names else None

    def media_type(self, path: str) -> str:
        return next((m["media_type"] for m in self.manifest.values() if m["path"] == path), "")

    def contents(self) -> tuple[list[tuple[str, str, int]], dict[str, str]]:
        """[(title, target path#fragment, depth)] from the nav document, else the NCX; and landmarks."""
        landmarks: dict[str, str] = {}
        entries: list[tuple[str, str, int]] = []
        nav_path = next((m["path"] for m in self.manifest.values() if "nav" in m["properties"]), None)
        if nav_path and self.read(nav_path):
            soup = BeautifulSoup(self.read(nav_path), "html.parser")
            for nav in soup.find_all("nav"):
                kind = _epub_type(nav)
                if "landmarks" in kind:
                    for link in nav.find_all("a", href=True):
                        landmarks[self.resolve(nav_path, link["href"])] = _epub_type(link)
                elif "toc" in kind or not entries:
                    found: list[tuple[str, str, int]] = []
                    top = nav.find(["ol", "ul"])
                    if top is not None:
                        self._nav_list(top, nav_path, 1, found)
                    if "toc" in kind or found:
                        entries = found or entries
        if len(entries) < 2:
            ncx_path = self.manifest.get(self.ncx_id or "", {}).get("path") or next(
                (m["path"] for m in self.manifest.values() if m["media_type"] == "application/x-dtbncx+xml"), None)
            if ncx_path and self.read(ncx_path):
                soup = BeautifulSoup(self.read(ncx_path), "html.parser")
                nav_map = soup.find("navmap")
                ncx_entries: list[tuple[str, str, int]] = []
                if nav_map is not None:
                    self._ncx_points(nav_map, ncx_path, 1, ncx_entries)
                if len(ncx_entries) > len(entries):
                    entries = ncx_entries
        return entries, landmarks

    def _nav_list(self, node: Tag, base: str, depth: int, out: list) -> None:
        for item in node.find_all("li", recursive=False):
            link = item.find("a", href=True)
            label = item.find(["a", "span"])
            title = _clean(label.get_text(" ")) if label else ""
            if link is not None and title:
                out.append((title, self.resolve(base, link["href"]), depth))
            child = item.find(["ol", "ul"], recursive=False)
            if child is not None:
                self._nav_list(child, base, depth + 1, out)

    def _ncx_points(self, node: Tag, base: str, depth: int, out: list) -> None:
        for point in node.find_all("navpoint", recursive=False):
            label, content = point.find("navlabel"), point.find("content")
            title = _clean(label.get_text(" ")) if label else ""
            if content is not None and content.get("src") and title:
                out.append((title, self.resolve(base, content["src"]), depth))
            self._ncx_points(point, base, depth + 1, out)


class _Walker:
    """Turns the spine's documents into blocks, recording where every id lands."""

    def __init__(self, document: Document, container: _Container):
        self.doc = document
        self.container = container
        self.anchors: dict[str, int] = {}       # "path#id" or "path" -> block index
        self.types: dict[str, str] = {}         # "path#id" or "path" -> epub:type
        self.by_digest: dict[str, Figure] = {}
        self.path = ""

    # ---- documents ---------------------------------------------------------------------------

    def walk_document(self, path: str) -> None:
        raw = self.container.read(path)
        if raw is None:
            self.doc.warnings.append(f"spine document missing from the container: {path}")
            return
        self.path = path
        soup = BeautifulSoup(raw, "html.parser")
        body = soup.find("body") or soup
        self._drop_notes(body)
        self.anchors.setdefault(path, len(self.doc.blocks))
        self.types.setdefault(path, _epub_type(body) if isinstance(body, Tag) else "")
        self._walk(body, "paragraph")

    def _drop_notes(self, body: Tag) -> None:
        """Footnote bodies and the markers that point at them: noise in the running text."""
        for tag in list(body.find_all(True)):
            if getattr(tag, "decomposed", False):
                continue
            kind = _epub_type(tag)
            classes = " ".join(tag.get("class", [])) if isinstance(tag.get("class"), list) else str(tag.get("class", ""))
            if "noteref" in kind:
                tag.decompose()
            elif tag.name in ("aside", "div", "section", "p") and (
                    any(t in NOTE_TYPES for t in kind.split()) or re.search(r"\b(foot|end)notes?\b", classes, re.I)):
                tag.decompose()
            elif tag.name == "sup" and NOTE_MARKER.match(tag.get_text("")):
                tag.decompose()
            elif tag.name == "a" and NOTE_MARKER.match(tag.get_text("")) and "#" in str(tag.get("href", "")) \
                    and tag.find_parent("sup") is None and len(tag.get_text("")) <= 3:
                tag.decompose()

    # ---- the walk ------------------------------------------------------------------------------

    def _anchor(self, tag: Tag, deep: bool) -> None:
        """Ids land on the next block; `deep` for elements the walk does not descend into."""
        index = len(self.doc.blocks)
        nodes = [tag] if tag.get("id") else []
        if deep:
            nodes += tag.find_all(attrs={"id": True})
        for node in nodes:
            key = f"{self.path}#{node['id']}"
            self.anchors.setdefault(key, index)
            kind = _epub_type(node)
            if kind:
                self.types.setdefault(key, kind)

    def _walk(self, node: Tag, text_type: str) -> None:
        buffer: list[str] = []

        def flush() -> None:
            text = _clean("".join(buffer))
            buffer.clear()
            if text and any(ch.isalnum() for ch in text):  # "* * *" and rules are not text
                self.doc.blocks.append(Block(type=text_type, text=text, href=self.path))

        for child in node.children:
            if isinstance(child, Comment):
                continue
            if isinstance(child, NavigableString):
                buffer.append(str(child))
                continue
            if not isinstance(child, Tag):
                continue
            name = (child.name or "").lower().split(":")[-1]
            if name in SKIP_TAGS:
                continue
            descends = (name in TEXT_TAGS or name in CONTAINERS or name == "figure"
                        or child.find(list(BLOCK_LEVEL) + ["img", "image", "svg"]) is not None) \
                and name not in HEADINGS and name not in ("table", "svg")
            self._anchor(child, deep=not descends)
            if name in ("img", "image"):
                flush()
                self._figure(child)
            elif name == "svg":
                flush()
                for picture in child.find_all(["image", "img"]):
                    self._figure(picture)
            elif name == "br":
                buffer.append("\n")
            elif name in HEADINGS:
                flush()
                self._heading(child, HEADINGS[name])
            elif name == "table":
                flush()
                self._table(child)
            elif name == "hr":
                flush()
            elif name == "figure":
                flush()
                self._figure_element(child)
            elif name in TEXT_TAGS:
                flush()
                self._walk(child, "quote" if text_type == "quote" else TEXT_TAGS[name])
            elif name == "blockquote":
                flush()
                self._walk(child, "quote")
            elif descends:
                flush()
                self._walk(child, text_type)
            else:
                buffer.append(child.get_text(""))
        flush()

    def _heading(self, tag: Tag, level: int) -> None:
        text = _clean(tag.get_text(" "))
        for picture in tag.find_all(["img", "image"]):
            self._figure(picture, in_heading=True)
        if text:
            self.doc.blocks.append(Block(type="heading", text=text, level=level, href=self.path))

    def _table(self, tag: Tag) -> None:
        rows = []
        for row in tag.find_all("tr"):
            cells = [_clean(cell.get_text(" ")) for cell in row.find_all(["td", "th"])]
            if any(cells):
                rows.append(" | ".join(cells))
        caption = tag.find("caption")
        if caption is not None and _clean(caption.get_text(" ")):
            rows.insert(0, _clean(caption.get_text(" ")))
        if rows:
            self.doc.blocks.append(Block(type="table", text="\n".join(rows), href=self.path))
        for picture in tag.find_all(["img", "image"]):
            self._figure(picture)

    def _figure_element(self, tag: Tag) -> None:
        caption_tag = tag.find("figcaption")
        caption = _clean(caption_tag.get_text(" ")) if caption_tag is not None else ""
        pictures = tag.find_all(["img", "image"])
        for picture in pictures:
            self._figure(picture, caption=caption)
        if caption_tag is not None:
            caption_tag.decompose()
        for picture in tag.find_all(["img", "image", "svg"]):
            picture.decompose()
        if _clean(tag.get_text(" ")):
            self._walk(tag, "paragraph")
        elif not pictures and caption:
            self.doc.blocks.append(Block(type="paragraph", text=caption, href=self.path))

    def _figure(self, tag: Tag, caption: str = "", in_heading: bool = False) -> None:
        src = tag.get("src") or tag.get("xlink:href") or tag.get("href")
        if not src or str(src).startswith("data:"):
            return
        path = self.container.resolve(self.path, str(src)).split("#")[0]
        data = self.container.read(path)
        if data is None:
            self.doc.warnings.append(f"picture missing from the container: {path}")
            return
        digest = figure_rules.digest(data)
        known = self.by_digest.get(digest)
        if known is not None:
            width, height, media_type = known.width, known.height, known.media_type
        else:
            width, height, media_type = figure_rules.image_info(data, self.container.media_type(path))
        alt = _clean(str(tag.get("alt") or tag.get("title") or ""))
        figure = Figure(id=f"f{len(self.doc.figures) + 1}", media_type=media_type, width=width, height=height,
                        alt=alt, caption=caption, digest=digest, data=data)
        if self.container.cover_path and path == self.container.cover_path:
            figure.decorative, figure.reason = True, "cover"
            self.doc.cover = self.doc.cover or figure.id
        letter = figure_rules.drop_cap_letter(alt)
        if letter and (not width or min(width, height) < 400):
            figure.drop_cap = letter
        self.by_digest.setdefault(digest, figure)
        self.doc.figures[figure.id] = figure
        self.doc.blocks.append(Block(type="figure", figure=figure.id, href=self.path))


def _attach_captions(doc: Document) -> None:
    """A short "Fig. 3 ..." paragraph right after a picture is its caption, not running text."""
    keep: list[Block] = []
    for index, block in enumerate(doc.blocks):
        previous = keep[-1] if keep else None
        if (block.type == "paragraph" and previous is not None and previous.type == "figure"
                and CAPTION.match(block.text) and count_words(block.text) <= 60):
            figure = doc.figures[previous.figure]
            if not figure.caption:
                figure.caption = block.text
                continue
        keep.append(block)
    doc.blocks[:] = keep


def _restore_drop_caps(doc: Document) -> None:
    """A drop-cap picture holds the first letter of the next paragraph: put the letter back."""
    for index, block in enumerate(doc.blocks[:-1]):
        if block.type != "figure":
            continue
        figure = doc.figures[block.figure]
        following = doc.blocks[index + 1]
        if following.type not in ("paragraph", "quote", "item") or not following.text:
            continue
        starts_lower = following.text[0].islower()
        small = bool(figure.width) and min(figure.width, figure.height) < 400
        if figure.drop_cap and (starts_lower or not following.text[0].isalpha()):
            if starts_lower:
                following.text = figure.drop_cap + following.text
            figure.decorative, figure.reason = True, "drop-cap"
        elif starts_lower and small and not figure.caption and figure_rules.DECORATIVE_ALT.search(figure.alt or ""):
            figure.decorative, figure.reason = True, "drop-cap"
            doc.warnings.append(f"drop cap without a named letter before: {following.text[:40]}")


def _sections_from_contents(doc: Document, walker: _Walker, entries, landmarks) -> list[Section]:
    sections: list[Section] = []
    last = -1
    for title, target, depth in entries:
        index = walker.anchors.get(target)
        if index is None:
            index = walker.anchors.get(target.split("#")[0])
        if index is None or index < last:
            continue
        kind_hint = landmarks.get(target) or landmarks.get(target.split("#")[0]) or walker.types.get(target) \
            or walker.container.guide.get(target.split("#")[0], "") or walker.types.get(target.split("#")[0], "")
        sections.append(Section(id=f"s{len(sections) + 1}", title=normalize_title(title) or "—", level=depth,
                                kind=kind_hint or "", start=index, end=index))
        last = index
    return sections


def _sections_from_documents(doc: Document, walker: _Walker, spine: list[str]) -> list[Section]:
    sections = []
    for path in spine:
        start = walker.anchors.get(path)
        if start is None:
            continue
        end = len(doc.blocks)
        for other in spine[spine.index(path) + 1:]:
            if walker.anchors.get(other) is not None:
                end = walker.anchors[other]
                break
        texts = [b.text for b in doc.blocks[start:end] if b.type != "figure"]
        if not texts or sum(count_words(t) for t in texts) < 50:
            continue
        title = next((t for t in texts if count_words(t) <= 12), "")
        sections.append(Section(id=f"s{len(sections) + 1}", title=title[:200] or f"{len(sections) + 1}", level=1,
                                kind="", start=start, end=end))
    return sections if len(sections) >= 2 else []


def read_epub(data: bytes, sha256: str = "", mime: str = "application/epub+zip") -> Document:
    container = _Container(data)
    doc = Document(sha256=sha256, mime=mime, size=len(data), title=container.title, authors=container.authors)
    walker = _Walker(doc, container)
    for path in container.spine:
        walker.walk_document(path)
    if container.cover_path and not doc.cover:
        raw = container.read(container.cover_path)
        if raw:
            width, height, media_type = figure_rules.image_info(raw, container.media_type(container.cover_path))
            cover = Figure(id=f"f{len(doc.figures) + 1}", media_type=media_type, width=width, height=height,
                           digest=figure_rules.digest(raw), decorative=True, reason="cover", data=raw)
            doc.figures[cover.id] = cover
            doc.cover = cover.id
    _attach_captions(doc)
    _restore_drop_caps(doc)
    figure_rules.mark_decorative(doc.figures.values())

    body = [b.text for b in doc.blocks if b.type in ("paragraph", "quote", "item")]
    middle = "\n".join(body[len(body) // 5:])
    doc.language = detect_language(middle or "\n".join(body))

    entries, landmarks = container.contents()
    sections = _sections_from_contents(doc, walker, entries, landmarks) if len(entries) >= 2 else []
    doc.structure_source = "toc"
    if len(sections) < 2:
        sections, doc.structure_source = sections_from_headings(doc), "headings"
    if len(sections) < 2:
        sections, doc.structure_source = _sections_from_documents(doc, walker, container.spine), "documents"
    if len(sections) < 2:
        sections, doc.structure_source = equal_parts(doc), "pages"
    finalize_sections(doc, sections)
    return doc
