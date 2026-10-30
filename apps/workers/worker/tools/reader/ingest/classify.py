"""What kind of section a title (or an EPUB landmark) names: the author's text, or front and back matter.

English, Russian and Ukrainian titles. Anything not recognized is the author's text ("chapter"), so a
mistake keeps a section rather than dropping it.
"""

from __future__ import annotations

import re
from typing import Optional

_NUMBERING = re.compile(r"^\s*((chapter|part|book|section|глава|часть|книга|раздел|розділ|частина|частина)\s+"
                        r"[\wivxlcдм]+[.:)]?\s*|[ivxlc]+[.)]\s+|\d+(\.\d+)*[.)]?\s+)", re.I)

_TITLE_KINDS: list[tuple[str, re.Pattern]] = [(kind, re.compile(pattern, re.I)) for kind, pattern in [
    ("toc", r"^(table of contents|contents|содержан[иі]е|оглавлен[иі]е|зміст"
            r"|list of (illustrations|figures|tables|maps|plates)|(перечень|список) (иллюстраций|иллюстрацій|рисунков|таблиц)"
            r"|(перелік|список) (ілюстрацій|малюнків|таблиць))$"),
    ("license", r"^(.*\bproject gutenberg\b.*\blicen[cs]e\b.*|licen[cs]e|end of (the )?project gutenberg.*)$"),
    ("copyright", r"^(copyright( page)?|авторские права|выходные данные|вихідні дані|авторське право)$"),
    ("index", r"^((subject |name |general )?index|(предметный |именной |алфавитный )?указатель"
              r"|(предметний |іменний |алфавітний )?покажчик)$"),
    ("bibliography", r"^(bibliography|references|works cited|further reading|selected bibliography|sources"
                     r"|bibliographical note|bibliographic note|note on sources|sources and further reading"
                     r"|библиография|литература|список литературы|источники|использованная литература"
                     r"|бібліографія|література|список літератури|джерела|використана література)$"),
    ("notes", r"^(notes|endnotes|footnotes|notes and sources|примечания|комментарии|примітки|коментарі)$"),
    ("acknowledgments", r"^(acknowledge?ments?|благодарности|подяки|подяка)$"),
    ("about", r"^(about the authors?|about the book|об авторе|об авторах|о книге|про автора|про авторів|про книгу)$"),
    ("also_by", r"^(also by\b.*|other (books|titles) by\b.*|by the same author.*|books by\b.*"
                r"|другие книги автора.*|інші книги автора.*)$"),
    ("dedication", r"^(dedication|посвящение|присвята|присвячення)$"),
    ("glossary", r"^(glossary|глоссарий|словарь терминов|словник термінів|глосарій)$"),
    ("praise", r"^((advance )?praise for\b.*|отзывы.*|відгуки.*)$"),
    ("cover", r"^(cover|front cover|обложка|обкладинка)$"),
    ("title", r"^(title page|half title|титул|титульный лист|титульна сторінка)$"),
    ("colophon", r"^(colophon|выходные сведения|вихідні відомості)$"),
    ("appendix", r"^(appendix|appendices|приложение|приложения|додаток|додатки)\b.*$"),
]]

# EPUB 3 structural semantics (epub:type) and EPUB 2 guide types
_EPUB_TYPES = {
    "cover": "cover", "titlepage": "title", "title-page": "title", "halftitlepage": "title",
    "toc": "toc", "copyright-page": "copyright", "copyright": "copyright", "index": "index",
    "bibliography": "bibliography", "endnotes": "notes", "rearnotes": "notes", "footnotes": "notes",
    "acknowledgments": "acknowledgments", "acknowledgements": "acknowledgments", "colophon": "colophon",
    "dedication": "dedication", "glossary": "glossary", "appendix": "appendix", "other-credits": "about",
    "contributors": "about",
}

_COPYRIGHT_TEXT = re.compile(r"(\bISBN\b|all rights reserved|©|\(c\)\s*\d{4}|все права защищены|усі права захищені"
                             r"|всі права захищені|УДК\s*\d|ББК\s*\d)", re.I)


def normalize_title(title: str) -> str:
    text = re.sub(r"\s+", " ", (title or "")).strip(" .:—–- ")
    return text


def kind_of(title: str, epub_type: Optional[str] = None, text: str = "", words: Optional[int] = None) -> str:
    """The kind of a section from its title, its EPUB semantics and (for short ones) its text."""
    for token in (epub_type or "").split():
        token = token.split(":")[-1].lower()
        if token in _EPUB_TYPES:
            return _EPUB_TYPES[token]
    plain = normalize_title(title).lower()
    for candidate in (plain, _NUMBERING.sub("", plain).strip()):
        if not candidate:
            continue
        for kind, pattern in _TITLE_KINDS:
            if pattern.match(candidate):
                return kind
    count = words if words is not None else len(text.split())
    if text and count < 600 and len(_COPYRIGHT_TEXT.findall(text)) >= 2:
        return "copyright"
    return "chapter"


def is_part_title(title: str) -> bool:
    """"Part One", "Часть первая", "Частина 2": a divider that groups chapters."""
    return bool(re.match(r"^\s*(part|book|часть|книга|частина)\b", title or "", re.I))
