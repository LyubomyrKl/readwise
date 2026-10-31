import { test, expect } from "@playwright/test";
import { statSync } from "fs";
import { bookPath, uploadedIds } from "./books";
import { clearAnnotations, highlightWith, readPath, selectPdfText } from "./helpers";

const ids = uploadedIds();

test.describe("PDF reader", () => {
  test("opens a large illustrated PDF over ranges without downloading it", async ({ page }, info) => {
    test.skip(!ids.scanPdf, "big-scan.pdf is not in READER_BOOKS");
    const size = statSync(bookPath("scanPdf")).size;
    let bytes = 0;
    let wholeFile = false;
    const isBook = (url: string) => url.includes(`/documents/${ids.scanPdf}/download`);
    page.on("response", async (response) => {
      if (isBook(response.url()) && response.status() === 206) bytes += Number((await response.allHeaders())["content-length"] ?? 0);
    });
    // PDF.js opens with one unranged request and cancels it once the headers offer ranges: the
    // whole file came only if that request finished
    page.on("requestfinished", async (request) => {
      if (isBook(request.url()) && (await request.response())?.status() === 200) wholeFile = true;
    });

    const started = Date.now();
    await page.goto(readPath(ids.scanPdf!));
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] .textLayer span').first()).toBeVisible();
    const firstText = Date.now() - started;
    await expect(page.getByTestId("reader-location")).toContainText("/ 200");
    await page.waitForTimeout(1500);

    info.annotations.push({ type: "benchmark", description: `first page text after ${firstText} ms; ${bytes} of ${size} bytes fetched` });
    // the first, unranged request is cancelled once the headers show ranges; only ranges carry data
    expect(bytes).toBeLessThan(size * 0.05);
    expect(wholeFile).toBe(false);
  });

  test("goes to an outline entry and finds text", async ({ page }) => {
    test.skip(!ids.bigPdf, "big-1000.pdf is not in READER_BOOKS");
    await page.goto(readPath(ids.bigPdf!));
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] .textLayer span').first()).toBeVisible();

    await page.getByRole("button", { name: "Contents" }).click();
    await page.getByRole("button", { name: "Chapter 3", exact: true }).click();
    await expect(page.getByTestId("reader-location")).toContainText("41 / 1000");
    // the chapter's name comes from the server's structure: its sections carry their first page
    await expect(page.getByTestId("reader-chapter")).toHaveText("Chapter 3");

    await page.getByRole("button", { name: "Search" }).click();
    await page.getByLabel("Search for").fill("(12.3)");
    await page.getByRole("button", { name: "Find" }).click();
    const hit = page.locator("aside[aria-label='Search in the book'] li button").first();
    await expect(hit).toContainText("(12.3)");
    await hit.click();
    await expect(page.getByTestId("reader-location")).toContainText("12 / 1000");
    await expect(page.locator(".wb-hl-search").first()).toBeVisible();
  });

  test("highlights a selection, and the highlight comes back after a reload", async ({ page, request }) => {
    test.skip(!ids.paperPdf, "dropout.pdf is not in READER_BOOKS");
    await clearAnnotations(request, ids.paperPdf!);
    await page.goto(readPath(ids.paperPdf!));
    await expect(page.locator('.pdfViewer .page[data-page-number="1"] .textLayer span').first()).toBeVisible();

    const selected = await selectPdfText(page, 1, 4, 8);
    expect(selected.trim().length).toBeGreaterThan(10);
    await highlightWith(page, "Green");
    await expect(page.locator('.page[data-page-number="1"] .wb-hl').first()).toBeVisible();

    const saved = (await (await request.get(`/api/gw/reader/documents/${ids.paperPdf}/highlights`)).json()) as {
      anchor: { v: number; page: number; quads: number[][]; quote: { exact: string } };
    }[];
    expect(saved).toHaveLength(1);
    expect(saved[0].anchor).toMatchObject({ v: 2, format: "pdf", page: 0 });
    expect(saved[0].anchor.quads.length).toBeGreaterThan(0);
    expect(saved[0].anchor.quote.exact.length).toBeGreaterThan(10);

    await page.reload();
    await expect(page.locator('.page[data-page-number="1"] .wb-hl').first()).toBeVisible();
  });
});
