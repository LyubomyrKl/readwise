import { expect, type APIRequestContext, type Frame, type Page } from "@playwright/test";

export const readPath = (id: string) => `/apps/reader/book/${id}/read`;

/** Deletes a book's highlights and notes, so every run starts from none. */
export async function clearAnnotations(request: APIRequestContext, bookId: string): Promise<void> {
  const highlights = (await (await request.get(`/api/gw/reader/documents/${bookId}/highlights`)).json()) as { id: string }[];
  for (const h of highlights) await request.delete(`/api/gw/reader/highlights/${h.id}`);
  const notes = (await (await request.get(`/api/gw/reader/documents/${bookId}/notes`)).json()) as { id: string }[];
  for (const n of notes) await request.delete(`/api/gw/reader/notes/${n.id}`);
}

/** Selects `count` text spans of a PDF page's text layer, as a reader dragging over them would. */
export async function selectPdfText(page: Page, pageNumber: number, first = 0, count = 6): Promise<string> {
  return page.evaluate(
    ({ pageNumber, first, count }) => {
      const layer = document.querySelector(`.pdfViewer .page[data-page-number="${pageNumber}"] .textLayer`);
      if (!layer) throw new Error("no text layer");
      const spans = Array.from(layer.querySelectorAll("span")).filter(
        (s) => s.firstChild?.nodeType === Node.TEXT_NODE && (s.textContent ?? "").trim().length > 0,
      );
      const start = spans[first].firstChild as Text;
      const end = spans[Math.min(spans.length - 1, first + count - 1)].firstChild as Text;
      const range = document.createRange();
      range.setStart(start, 0);
      range.setEnd(end, end.data.length);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      layer.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      return range.toString();
    },
    { pageNumber, first, count },
  );
}

/**
 * The frame foliate-js renders the current chapter in, once it shows text; turns pages while it
 * shows none (a cover, a title page).
 */
export async function bookFrame(page: Page): Promise<Frame> {
  let frame: Frame | undefined;
  let polls = 0;
  await expect
    .poll(
      async () => {
        for (const f of page.frames()) {
          if (f === page.mainFrame()) continue;
          const length = await f.evaluate(() => document.body?.textContent?.trim().length ?? 0).catch(() => 0);
          if (length > 400) {
            frame = f;
            return true;
          }
        }
        polls += 1;
        if (polls % 2 === 0) await page.getByRole("button", { name: "Next page" }).click({ trial: false }).catch(() => {});
        return false;
      },
      { timeout: 60_000, intervals: [1000], message: "the book frame shows no text" },
    )
    .toBe(true);
  return frame!;
}

/** Selects the first `chars` characters of the first long paragraph in the chapter frame. */
export async function selectEpubText(frame: Frame, chars = 60): Promise<string> {
  return frame.evaluate((chars) => {
    // the chapter is one wide frame of columns: visible means on the top-level screen
    const frameBox = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const screenWidth = window.parent.innerWidth;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n as Text;
      const box = text.parentElement?.getBoundingClientRect();
      const left = box ? frameBox.left + box.left : -1;
      const visible = box && box.width > 0 && left >= 0 && left + Math.min(box.width, 200) < screenWidth;
      if (visible && text.data.trim().length >= chars) {
        node = text;
        break;
      }
    }
    if (!node) throw new Error("no paragraph long enough on the page");
    const offset = node.data.search(/\S/);
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset + chars);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return range.toString();
  }, chars);
}

/** Picks a colour in the selection popover and saves the highlight. */
export async function highlightWith(page: Page, color = "Green"): Promise<void> {
  await page.getByTitle(color).click();
  const saved = page.waitForResponse((r) => r.url().endsWith("/highlights") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  expect((await saved).ok()).toBe(true);
}

/** The percent in the bottom bar ("12 / 300 · 4%"). */
export async function percentShown(page: Page): Promise<number> {
  const text = (await page.getByTestId("reader-location").textContent()) ?? "";
  const match = /(\d+)%\s*$/.exec(text.trim());
  return match ? Number(match[1]) : -1;
}
