import { describeRange, indexText, offsetsToRange, quoteToRange, rangeToOffsets } from "@tools/reader/reading/engines/domText";

function chapter(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

describe("indexText", () => {
  it("joins text nodes, separates blocks and line breaks, and skips scripts and styles", () => {
    const root = chapter(
      "<p>Hello <b>wide</b>   world</p><p>Second<br>line</p><script>var x = 1;</script><style>p{}</style><span>end</span>",
    );
    const index = indexText(root);
    expect(index.text).toBe("Hello wide world Second line end");
  });
});

describe("ranges and offsets", () => {
  it("turns a selection into normalized offsets, a quote and a position", () => {
    const root = chapter("<p>Під Пилявцями   козаки <i>розбили</i> коронне військо.</p>");
    const index = indexText(root);
    const p = root.querySelector("p")!;
    const range = document.createRange();
    // from inside "козаки" to the end of "коронне"
    range.setStart(p.firstChild!, p.firstChild!.textContent!.indexOf("козаки"));
    range.setEnd(p.lastChild!, " коронне".length);
    const described = describeRange(index, range)!;
    expect(described.quote.exact).toBe("козаки розбили коронне");
    expect(described.quote.prefix).toBe("Під Пилявцями ");
    expect(described.quote.suffix).toBe(" військо.");
    expect(described.position).toEqual({ start: 14, end: 36 });
  });

  it("maps offsets back to the same text", () => {
    const root = chapter("<p>alpha <b>beta</b></p><p>gamma delta</p>");
    const index = indexText(root);
    const start = index.text.indexOf("beta");
    const end = index.text.indexOf("delta") + "delta".length;
    const range = offsetsToRange(index, start, end)!;
    expect(range.toString().replace(/\s+/g, " ")).toBe("betagamma delta");
    expect(rangeToOffsets(index, range)).toEqual({ start, end });
  });

  it("finds a stored quote as a range even after the text moved", () => {
    const root = chapter("<p>New preface paragraph.</p><p>The quick brown fox jumps over the lazy dog.</p>");
    const index = indexText(root);
    const found = quoteToRange(index, { exact: "brown fox jumps", prefix: "The quick ", suffix: " over" }, 0)!;
    expect(found.range.toString()).toBe("brown fox jumps");
    expect(found.score).toBeGreaterThan(0.9);
  });
});
