"""The abridged edition as an EPUB 3: the book's own chapters in order, each opening with its summary,
then the abridged text with the original pictures and captions; the book overview first.

The description of a picture becomes its alt text, which also makes the edition accessible.
"""

from __future__ import annotations

import html
import io
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from ebooklib import epub

from worker.tools.reader.ingest.ir import Figure
from worker.tools.reader.abridge.text import FIGURE_MARKER, paragraphs

STRINGS = {
    "en": {"suffix": " (abridged)", "in_short": "In short", "about": "About this edition",
           "note": "An abridged edition: each chapter opens with a short summary, followed by the chapter abridged to "
                   "about {ratio}% of its length. The pictures are the book's own.",
           "made": "Made with {model} on {day}.", "overview": "The book in brief"},
    "ru": {"suffix": " (сокращённое издание)", "in_short": "Коротко", "about": "Об этом издании",
           "note": "Сокращённое издание: каждая глава начинается с краткого содержания, за которым следует сама глава, "
                   "сокращённая примерно до {ratio}% объёма. Иллюстрации взяты из книги.",
           "made": "Сделано с {model}, {day}.", "overview": "Книга вкратце"},
    "uk": {"suffix": " (скорочене видання)", "in_short": "Коротко", "about": "Про це видання",
           "note": "Скорочене видання: кожен розділ починається з короткого змісту, за яким іде сам розділ, скорочений "
                   "приблизно до {ratio}% обсягу. Ілюстрації взято з книжки.",
           "made": "Зроблено за допомогою {model}, {day}.", "overview": "Книжка коротко"},
}

CSS = """
body { font-family: Georgia, serif; line-height: 1.5; }
h1 { font-size: 1.6em; margin: 1em 0 0.6em; }
h1.part { font-size: 2em; text-align: center; margin-top: 30%; }
h2 { font-size: 1.3em; margin: 1em 0 0.5em; }
h3 { font-size: 1.1em; margin: 1em 0 0.4em; }
aside.summary { border-left: 3px solid #999; background: #f4f4f4; padding: 0.5em 0.9em; margin: 0.8em 0 1.4em; }
aside.summary p.label { font-weight: bold; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em;
  margin: 0 0 0.3em; }
figure { margin: 1em 0; text-align: center; }
figure img { max-width: 100%; height: auto; }
figcaption { font-size: 0.9em; font-style: italic; margin-top: 0.3em; }
p.note { font-size: 0.9em; color: #555; }
"""


@dataclass
class EditionChapter:
    title: str
    level: int
    divider: bool = False
    summary: str = ""
    text: str = ""                      # paragraphs, "## heading" lines and "[[FIG n]]" lines


@dataclass
class EditionPicture:
    number: int
    figure: Figure
    data: bytes
    description: str = ""


@dataclass
class EditionBook:
    identifier: str
    title: str
    authors: list[str]
    language: str
    overview: str
    chapters: list[EditionChapter]
    pictures: dict[int, EditionPicture] = field(default_factory=dict)
    cover: Optional[tuple[bytes, str]] = None      # (bytes, media type)
    ratio: float = 0.0
    model: str = ""


def strings(lang: str) -> dict:
    return STRINGS.get(lang, STRINGS["en"])


def edition_title(title: str, lang: str) -> str:
    return f"{title}{strings(lang)['suffix']}"


def _p(text: str) -> str:
    return f"<p>{html.escape(text)}</p>"


def _body(book: EditionBook, chapter: EditionChapter, used: set[int]) -> str:
    s = strings(book.language)
    tag = "h1" if chapter.level <= 1 else "h2"
    if chapter.divider:
        return f'<h1 class="part">{html.escape(chapter.title)}</h1>'
    out = [f"<{tag}>{html.escape(chapter.title)}</{tag}>"]
    if chapter.summary:
        out.append(f'<aside class="summary" epub:type="abstract"><p class="label">{html.escape(s["in_short"])}</p>'
                   + "".join(_p(p) for p in paragraphs(chapter.summary)) + "</aside>")
    for line in paragraphs(chapter.text):
        figure = FIGURE_MARKER.fullmatch(line)
        if figure:
            number = int(figure.group(1))
            picture = book.pictures.get(number)
            if picture is None or number in used:
                continue
            used.add(number)
            caption = (picture.figure.caption or "").strip()
            alt = picture.description or caption or picture.figure.alt or ""
            out.append(f'<figure><img src="images/fig{number}.{picture.figure.extension}" alt="{html.escape(alt, True)}"/>'
                       + (f"<figcaption>{html.escape(caption)}</figcaption>" if caption else "") + "</figure>")
        elif line.startswith("## "):
            out.append(f"<h3>{html.escape(line[3:].strip())}</h3>")
        else:
            out.append(_p(line))
    return "\n".join(out)


def build(book: EditionBook) -> bytes:
    s = strings(book.language)
    out = epub.EpubBook()
    out.set_identifier(book.identifier)
    out.set_title(book.title)
    out.set_language(book.language if book.language in STRINGS else "en")
    for author in book.authors or [""]:
        if author:
            out.add_author(author)
    if book.cover:
        data, media_type = book.cover
        extension = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif"}.get(media_type, "jpg")
        out.set_cover(f"images/cover.{extension}", data, create_page=False)
    style = epub.EpubItem(uid="style", file_name="style/edition.css", media_type="text/css", content=CSS)
    out.add_item(style)

    def page(name: str, title: str, body: str) -> epub.EpubHtml:
        item = epub.EpubHtml(title=title, file_name=name, lang=book.language)
        item.content = f"<html><head><title>{html.escape(title)}</title></head><body>{body}</body></html>"
        item.add_item(style)
        out.add_item(item)
        return item

    about_body = [f"<h1>{html.escape(s['overview'])}</h1>"] + [_p(p) for p in paragraphs(book.overview)]
    about_body.append(f"<h2>{html.escape(s['about'])}</h2>")
    about_body.append(f'<p class="note">{html.escape(s["note"].format(ratio=round(book.ratio * 100)))} '
                      f'{html.escape(s["made"].format(model=book.model, day=date.today().isoformat()))}</p>')
    about = page("about.xhtml", s["overview"], "\n".join(about_body))
    spine, toc, current_part = [about], [about], None
    used: set[int] = set()
    for index, chapter in enumerate(book.chapters, 1):
        item = page(f"chapter-{index:03d}.xhtml", chapter.title, _body(book, chapter, used))
        spine.append(item)
        link = epub.Link(item.file_name, chapter.title, f"c{index}")
        if chapter.divider:
            current_part = (epub.Section(chapter.title, item.file_name), [])
            toc.append(current_part)
        elif chapter.level > 1 and current_part is not None:
            current_part[1].append(link)
        else:
            current_part = None if chapter.level <= 1 else current_part
            toc.append(link)
    for number, picture in book.pictures.items():
        if number in used:
            out.add_item(epub.EpubItem(uid=f"fig{number}", file_name=f"images/fig{number}.{picture.figure.extension}",
                                       media_type=picture.figure.media_type, content=picture.data))
    out.toc = toc
    out.spine = spine
    out.add_item(epub.EpubNcx())
    out.add_item(epub.EpubNav())
    buffer = io.BytesIO()
    epub.write_epub(buffer, out, {})
    return buffer.getvalue()


def plain_text(chapter_text: str) -> str:
    """The abridged text without markers or heading marks, for word counts."""
    return re.sub(r"(?m)^## ", "", FIGURE_MARKER.sub("", chapter_text))
