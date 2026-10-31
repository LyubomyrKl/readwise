import { test, expect, type Frame, type Page } from "@playwright/test";
import { writeFileSync } from "fs";
import { join } from "path";
import { BOOKS, BOOKS_DIR, uploadedIds, type BookKey } from "./books";
import { bookFrame, clearAnnotations, highlightWith, readPath, selectEpubText, selectPdfText } from "./helpers";

/**
 * Opt-in (READER_ANCHORS=1, Chrome): highlights across each real book, as a reader would make them,
 * and writes their locators to READER_BOOKS/anchors.json. The workers' test_anchors.py then checks
 * that every one finds its block in the IR built from the same file (docs/document-architecture.md,
 * Testing). The highlights stay on the test account.
 */
const ids = uploadedIds();
const collected: Record<string, unknown[]> = {};

test.skip(!process.env.READER_ANCHORS, "set READER_ANCHORS=1 to collect locators from real books");
test.describe.configure({ mode: "serial" });

async function selectVisible(page: Page, chars: number): Promise<string> {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const text = await selectEpubText(frame as Frame, chars).catch(() => null);
    if (text) return text;
  }
  throw new Error("no visible paragraph long enough");
}

for (const key of ["englishEpub", "russianEpub", "bigEpub"] as BookKey[]) {
  test(`highlights across ${key}`, async ({ page, request, browserName }) => {
    test.skip(browserName !== "chromium" || !ids[key], `${key} is not uploaded`);
    await clearAnnotations(request, ids[key]!);
    await page.goto(readPath(ids[key]!));
    await bookFrame(page);
    await page.getByRole("button", { name: "Contents" }).click();
    const entries = await page.locator("aside[aria-label='Table of contents'] li button").count();
    await page.keyboard.press("Escape");
    const picks = [...new Set(Array.from({ length: 6 }, (_, i) => Math.floor((i * (entries - 1)) / 5)))];
    for (const [n, entry] of picks.entries()) {
      await page.getByRole("button", { name: "Contents" }).click();
      await page.locator("aside[aria-label='Table of contents'] li button").nth(entry).click();
      await bookFrame(page);
      await page.waitForTimeout(500);
      const selected = await selectVisible(page, 30 + n * 9).catch(() => null);
      if (!selected) continue; // a picture or a short title page
      await highlightWith(page, "Yellow");
    }
    collected[BOOKS[key].file] = ((await (await request.get(`/api/gw/reader/documents/${ids[key]}/highlights`)).json()) as {
      anchor: unknown;
    }[]).map((h) => h.anchor);
    expect(collected[BOOKS[key].file].length).toBeGreaterThan(1);
  });
}

test("highlights across the paper PDF", async ({ page, request, browserName }) => {
  test.skip(browserName !== "chromium" || !ids.paperPdf, "paperPdf is not uploaded");
  await clearAnnotations(request, ids.paperPdf!);
  await page.goto(readPath(ids.paperPdf!));
  await expect(page.locator('.pdfViewer .page[data-page-number="1"] .textLayer span').first()).toBeVisible();
  for (const [n, pageNumber] of [1, 2, 4, 6, 9, 12].entries()) {
    const pageBox = page.locator(`.pdfViewer .page[data-page-number="${pageNumber}"]`);
    if (!(await pageBox.count())) continue;
    await pageBox.scrollIntoViewIfNeeded();
    await expect(pageBox.locator(".textLayer span").first()).toBeVisible();
    await selectPdfText(page, pageNumber, 20 + n * 7, 6);
    await highlightWith(page, "Green");
  }
  collected[BOOKS.paperPdf.file] = ((await (await request.get(`/api/gw/reader/documents/${ids.paperPdf}/highlights`)).json()) as {
    anchor: unknown;
  }[]).map((h) => h.anchor);
  expect(collected[BOOKS.paperPdf.file].length).toBeGreaterThan(3);
});

test.afterAll(() => {
  if (Object.keys(collected).length) writeFileSync(join(BOOKS_DIR, "anchors.json"), JSON.stringify(collected, null, 2));
});
