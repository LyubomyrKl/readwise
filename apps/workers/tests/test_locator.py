"""Locator v2 in the workers: the shared normalization cases and quote matching."""
import json

import pytest

from conftest import CONTRACTS
from worker.tools.reader.locator import Quote, build_quote, find_quote, normalize_text

CASES = json.loads((CONTRACTS.parent / "locator" / "normalize.cases.json").read_text("utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_normalization_matches_the_web_reader(case):
    assert normalize_text(case["input"]) == case["expected"]


def test_build_quote_trims_the_edges_and_keeps_context():
    text = "x" * 40 + " the quick brown fox " + "y" * 40
    start = text.index(" the")
    quote, s, e = build_quote(text, start, start + len(" the quick "))
    assert quote.exact == "the quick" and text[s:e] == "the quick"
    assert len(quote.prefix) == 32 and quote.suffix.startswith(" brown fox")


CHAPTER = ("Хмельницький вирушив під Пилявці у вересні 1648 року. Під Пилявцями козаки розбили коронне "
           "військо. Після Пилявців шлях на Львів був відкритий, і в жовтні почалася облога Львова.")


def test_finds_an_exact_quote():
    m = find_quote(CHAPTER, Quote("розбили коронне військо"))
    assert m is not None and CHAPTER[m.start:m.end] == "розбили коронне військо"


def test_context_decides_between_repeats():
    text = "red apple and green apple and red pear"
    m = find_quote(text, Quote("apple", prefix="and green ", suffix=" and red"))
    assert m.start == text.index("green apple") + len("green ")


def test_finds_a_quote_whose_text_changed_a_little():
    edited = CHAPTER.replace("коронне військо", "коронне польське військо")
    m = find_quote(edited, Quote("козаки розбили коронне військо", "Під Пилявцями ", ". Після"))
    assert m is not None and "козаки розбили" in edited[m.start:m.end]


def test_gives_up_on_text_that_is_not_there():
    assert find_quote(CHAPTER, Quote("the quick brown fox jumps over the lazy dog")) is None
    assert find_quote(CHAPTER, Quote("   ")) is None
