import { readFileSync } from "fs";
import { join } from "path";
import {
  buildQuote,
  codePoints,
  findQuote,
  normalizeText,
  normalizeWithMap,
  percentOf,
  rawToNormalized,
  toCodePointIndex,
  toLocator,
  toUtf16Index,
} from "@tools/reader/reading/locator";

type Case = { name: string; input: string; expected: string };
const shared = JSON.parse(
  readFileSync(join(__dirname, "../../../../../packages/contracts/locator/normalize.cases.json"), "utf-8"),
) as { cases: Case[] };

describe("normalizeText (shared cases with the workers)", () => {
  it.each(shared.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(normalizeText(c.input)).toBe(c.expected);
  });

  it.each(shared.cases.map((c) => [c.name, c] as const))("the mapped variant agrees: %s", (_name, c) => {
    const { text, toRaw } = normalizeWithMap(c.input);
    expect(text).toBe(c.expected);
    expect(toRaw).toHaveLength(text.length + 1);
    expect(toRaw[text.length]).toBe(c.input.length);
    for (let i = 1; i < toRaw.length; i += 1) expect(toRaw[i]).toBeGreaterThanOrEqual(toRaw[i - 1]);
  });
});

describe("normalizeWithMap", () => {
  it("maps a raw selection to normalized offsets and back", () => {
    const raw = "Перша  частина:\n\tНікополь" + String.fromCharCode(0xad) + "ська січ";
    const { text, toRaw } = normalizeWithMap(raw);
    expect(text).toBe("Перша частина: Нікопольська січ");
    const rawStart = raw.indexOf("Нікополь");
    const start = rawToNormalized(toRaw, rawStart);
    expect(text.slice(start, start + 12)).toBe("Нікопольська");
    expect(toRaw[start]).toBe(rawStart);
  });
});

describe("code points", () => {
  it("counts astral characters once and converts indices both ways", () => {
    const s = "a𝔸b";
    expect(s.length).toBe(4);
    expect(codePoints(s)).toBe(3);
    expect(toCodePointIndex(s, 3)).toBe(2);
    expect(toUtf16Index(s, 2)).toBe(3);
  });
});

describe("buildQuote", () => {
  it("takes the words without edge spaces, with up to 32 characters of context", () => {
    const text = "x".repeat(40) + " the quick brown fox " + "y".repeat(40);
    const start = text.indexOf(" the");
    const { quote, start: s, end: e } = buildQuote(text, start, start + " the quick ".length);
    expect(quote.exact).toBe("the quick");
    expect(text.slice(s, e)).toBe("the quick");
    expect(quote.prefix).toHaveLength(32);
    expect(quote.prefix!.endsWith("x ")).toBe(true);
    expect(quote.suffix!.startsWith(" brown fox")).toBe(true);
  });
});

describe("findQuote", () => {
  const chapter =
    "Хмельницький вирушив під Пилявці у вересні 1648 року. Під Пилявцями козаки розбили коронне військо. " +
    "Після Пилявців шлях на Львів був відкритий, і в жовтні почалася облога Львова.";

  it("finds an exact quote", () => {
    const m = findQuote(chapter, { exact: "розбили коронне військо" });
    expect(m).not.toBeNull();
    expect(chapter.slice(m!.start, m!.end)).toBe("розбили коронне військо");
    expect(m!.score).toBeGreaterThan(0.9);
  });

  it("tells repeated words apart by their context", () => {
    const text = "red apple and green apple and red pear";
    const m = findQuote(text, { exact: "apple", prefix: "and green ", suffix: " and red" });
    expect(m!.start).toBe(text.indexOf("green apple") + "green ".length);
  });

  it("uses the last position when the context does not decide", () => {
    const text = "word one. word two. word three.";
    const second = text.indexOf("word", 5);
    expect(findQuote(text, { exact: "word" }, second)!.start).toBe(second);
  });

  it("finds a quote whose text changed a little", () => {
    const edited = chapter.replace("коронне військо", "коронне польське військо");
    const m = findQuote(edited, { exact: "козаки розбили коронне військо", prefix: "Під Пилявцями ", suffix: ". Після" });
    expect(m).not.toBeNull();
    expect(edited.slice(m!.start, m!.end)).toContain("козаки розбили коронне");
  });

  it("normalizes the stored quote before searching", () => {
    expect(findQuote(chapter, { exact: "у  вересні\n1648" })).not.toBeNull();
  });

  it("gives up on text that is not there", () => {
    expect(findQuote(chapter, { exact: "the quick brown fox jumps over the lazy dog" })).toBeNull();
    expect(findQuote(chapter, { exact: "   " })).toBeNull();
  });

  it("finds a short quote exactly or not at all", () => {
    // a page number or a single word: one error allowed would match half the page
    expect(findQuote(chapter, { exact: "12" })).toBeNull();
    expect(findQuote(`${chapter} 1648`, { exact: "1648" })).not.toBeNull();
  });
});

describe("toLocator", () => {
  it("reads a v1 PDF position as a 0-based page with the percentage", () => {
    expect(toLocator({ type: "pdf", page: 12, percentage: 25 }, "pdf")).toEqual({ v: 2, format: "pdf", page: 11, totalProgression: 0.25 });
  });

  it("keeps a v1 CFI to try first", () => {
    expect(toLocator({ type: "epub", cfi: "epubcfi(/6/4!/4/2/1:0)", percentage: 0 }, "epub")).toMatchObject({
      v: 2,
      format: "epub",
      cfi: "epubcfi(/6/4!/4/2/1:0)",
    });
  });

  it("passes v2 through and rejects what carries no place", () => {
    const v2 = { v: 2, format: "epub", href: "ch1.xhtml", progression: 0.5 } as const;
    expect(toLocator(v2, "epub")).toBe(v2);
    expect(toLocator({ type: "pdf" }, "pdf")).toBeNull();
    expect(toLocator(null, "pdf")).toBeNull();
    expect(toLocator("x", "pdf")).toBeNull();
  });

  it("turns a total progression into a percent", () => {
    expect(percentOf({ v: 2, format: "pdf", totalProgression: 0.426 })).toBe(43);
    expect(percentOf(null)).toBe(0);
  });
});
