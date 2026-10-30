"""Every prompt of the engine. The part, summary, check, confirm and fix prompts are the ones the
owner's round-3 blind ratings were given on (Appendix B.11); change them only with a new round of
ratings, and bump PROMPT_VERSION (it is part of the manifest key, so a resume never mixes versions).
"""

from __future__ import annotations

# 2: the check, confirmation and fix see the book, author and chapter the writer saw; the fix keeps the
#    abridgement's person and tense; a sentence that mends an obvious slip of the source is not an error
#    (both seen on the first real runs, 2026-10-30); a rewrite replaces the sentence only when COMPARE
#    prefers it in both orders (a fix had turned a loose sentence into one with the wrong sides of a battle);
#    the writer's fact-check prompts start with the source (prefix cache)
PROMPT_VERSION = 2

LANG_RULES = {
    "uk": "Write in modern standard Ukrainian. Never use Russian words, Russian grammar or the letters ы, э, ъ, ё, "
          "and never put Latin letters inside Ukrainian words.",
    "ru": "Write in modern standard Russian. Never use the Ukrainian letters і, ї, є, ґ, and never put Latin letters "
          "inside Russian words.",
    "en": "Write in clear modern English.",
}
OTHER_RULE = "Write in the language of the source text."

SUMMARY = """Book: {book} by {author}
Chapter: {chapter}
Output language: {language}. {rule}

Write a 120-180 word summary of the chapter below: its main point and how the author develops it
(or what happens, for narrative). Every statement must be supported by the chapter: keep negations,
who did or said what, causes and dates exactly as in the source. Do not mention picture markers.
Output only the summary.

<chapter>
{text}
</chapter>"""

SEGMENTS_SUMMARY = """Book: {book} by {author}
Chapter: {chapter}
Output language: {language}. {rule}

Below are summaries of consecutive segments of one long chapter, in order. Write a 120-180 word summary of
the whole chapter: its main point and how the author develops it (or what happens, for narrative). Use only
what the segment summaries say. Output only the summary.

{segments}"""

PART = """Book: {book} by {author}
Chapter: {chapter} (part {index} of {count})
Output language: {language}. {rule}

You are writing a faithful abridged edition of this chapter, one part at a time.
Summary of the whole chapter (context only, do not copy it):
{summary}
{previous}
Abridge ONLY the part below to about {target_words} words (about {sentences} sentences).
Keep the author's order of ideas, key arguments, examples, names, dates and numbers, in the author's voice.
Every statement must be supported by this part: do not add, merge or reinterpret facts, and keep negations,
who did or said what, causes and dates exactly as in the source.
No introduction, conclusion, headings or commentary, and do not repeat what the abridgement already said.
Keep paragraph breaks. Output only the abridged text.{extras}

<part>
{text}
</part>"""

PREVIOUS = "The abridgement so far ends with: «{ending}»\n"
HEADINGS_RULE = ("\nLines that start with ## are the chapter's own subheadings: keep each of them unchanged, on its own "
                 "line, where it belongs.")
FIGURES_RULE = ("\nThe part contains picture markers like [[FIG 3: caption — description]]. Put the short marker "
                "[[FIG 3]] on its own line where that picture belongs, for every picture marker in the part; you may "
                "mention in the text what a picture shows.")

RETRY_LENGTH = ("That has {words} words, but the abridgement of this part must have about {target_words} words "
                "(between {low} and {high}). Rewrite it to about {target_words} words, following all the rules above. "
                "Output only the abridged text.")
RETRY_LANGUAGE = ("That text breaks the language rule: {problems}. Rewrite it in correct {language}, otherwise unchanged. "
                  "Output only the abridged text.")

CHECK = """You are checking an abridgement against its source for faithfulness.
List every statement in the ABRIDGEMENT that:
- contradicts the SOURCE (including a lost or added negation),
- attributes something to the wrong person, place, time or cause,
- or adds a fact, detail, example or comparison that the SOURCE does not contain.
Do not list omissions, style or grammar. Quote the abridgement exactly.
One problem per line, in this format:
QUOTE: <exact words from the abridgement> | PROBLEM: <what is wrong> | SOURCE: <the relevant source words, or "not in source">
If there are no problems, answer exactly: NONE

<source>
{source}
</source>

<abridgement>
{abridgement}
</abridgement>"""

# The writer's fact-check prompts open with the source, so the server reuses its cached prefix across the
# confirmations, fixes and comparisons of one part (one read of ~1,200 words instead of one per call).
CONFIRM = """<source>
{source}
</source>

A checker claims that a sentence of an abridgement of the source above misstates it.
Decide whether the sentence really CONTRADICTS the source (including a lost or added negation), names the wrong
person, place, time or cause, or ADDS a fact, detail or comparison that the source does not contain.
A paraphrase, a shortening, a generalisation that stays true, or a missing detail is NOT an error. Nor is a
sentence that agrees with the rest of the source where the source slips (for example a century that does not
match the years the source gives).
Answer with one word: YES or NO.

Sentence: {sentence}
Checker's claim: {problem}"""

FIX = """<source>
{source}
</source>

Output language: {language}. {rule}

A sentence in an abridged text misstates the source above. Rewrite only that sentence so that it is faithful to
the source, in the same style and of about the same length. Keep the person, tense and voice of the sentence (do
not switch to "I" or "we" unless it already uses them) and use modern words, not the source's archaic ones.
If it cannot be made faithful, answer exactly DELETE. Output only the corrected sentence.

Problem found by a checker: {problem}
Sentence: {sentence}"""

COMPARE = """<source>
{source}
</source>

Two versions of one sentence of an abridgement of the source above. Which one is more faithful to the source:
fewer contradictions (a wrong person, side, place, time, number or cause, a lost or added negation) and fewer
facts the source does not contain? Answer with one letter: A or B.

A: {first}
B: {second}"""

FIX_SPELLING = """<source>
{source}
</source>

Output language: {language}. {rule}

The sentence below contains a misspelled word that mixes Latin and Cyrillic letters: {words}. Rewrite the
sentence in correct {language}, keeping its meaning, style and length. Use the source above for the right word.
Output only the corrected sentence.

Sentence: {sentence}"""

PROOFREAD = """Below is a text in {language}. List every word or short phrase in it that is misspelled or is not
standard modern {language}: a Russian word or form, a Latin letter inside a word, a wrong case, ending or
preposition. Give the corrected form. Do not touch names, numbers, style or meaning, and do not list
anything that is correct.
One per line, in this format:
WRONG: <exact words from the text> | RIGHT: <the corrected words>
If there is nothing to correct, answer exactly: NONE

<text>
{text}
</text>"""

DESCRIBE = """This picture is from the book "{book}". Caption: «{caption}».
In 1-2 sentences in {language}, say what the picture shows for a reader who cannot see it: the subject, and for
a chart, map or diagram what it shows and its main trend. Do not invent numbers or names you cannot read.
Output only the description."""

DROP_CAP = ("This small picture is a decorative initial (drop cap) at the start of a paragraph in a {language} book. "
            "Which single letter does it show? Answer with that one letter only.")

OVERVIEW = """Book: {book} by {author}
Output language: {language}. {rule}

Below are summaries of the book's chapters, in order. Write an overview of the whole book in 150-250 words:
what it is about, its main thread or argument, and how it is organized. Use only what the summaries say.
Output only the overview.

{summaries}"""

OCR = ("This is a scanned page of a book, most likely in {language}. Transcribe all of its text exactly as printed, "
       "in reading order and in the original spelling. Separate paragraphs with a blank line and put # before a line "
       "that is a chapter or section heading. Leave out running headers and page numbers. Output only the text.")
