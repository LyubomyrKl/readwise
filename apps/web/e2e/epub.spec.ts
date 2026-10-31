import { test, expect } from "@playwright/test";
import { uploadedIds, type BookKey } from "./books";
import { bookFrame, clearAnnotations, highlightWith, percentShown, readPath, selectEpubText } from "./helpers";

const ids = uploadedIds();

for (const key of ["englishEpub", "russianEpub"] as BookKey[]) {
  test.describe(`EPUB reader (${key})`, () => {
    test.skip(!ids[key], `${key} is not in READER_BOOKS`);

    test("opens, shows progress, and reopens at the same place", async ({ page }) => {
      // from the book page, as a reader comes: Back returns there
      await page.goto(`/apps/reader/book/${ids[key]}`);
      await page.goto(readPath(ids[key]!));
      await bookFrame(page);
      await expect(page.getByTestId("reader-location")).not.toHaveText("");

      // half way through by the progress bar: the percent is real (it was always 0 before)
      const bar = page.getByRole("button", { name: /^Progress/ });
      const box = (await bar.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
      await expect.poll(() => percentShown(page)).toBeGreaterThan(30);
      const before = await percentShown(page);

      // back saves the position; opening again lands there
      await page.getByRole("button", { name: "Back" }).click();
      await page.waitForURL(new RegExp(`/apps/reader/book/${ids[key]}$`));
      await page.goto(readPath(ids[key]!));
      await bookFrame(page);
      await expect.poll(() => percentShown(page)).toBeGreaterThan(before - 4);
      expect(await percentShown(page)).toBeLessThan(before + 4);
    });

    test("highlights a selection, and the highlight comes back after a reload", async ({ page, request }) => {
      await clearAnnotations(request, ids[key]!);
      await page.goto(readPath(ids[key]!));
      const frame = await bookFrame(page);
      const host = page.locator("[data-highlights-drawn]");

      const selected = await selectEpubText(frame, 50);
      await highlightWith(page, "Yellow");
      await expect(host).toHaveAttribute("data-highlights-drawn", "1");

      const saved = (await (await request.get(`/api/gw/reader/documents/${ids[key]}/highlights`)).json()) as {
        anchor: { v: number; href: string; cfi: string; quote: { exact: string; prefix: string; suffix: string } };
      }[];
      expect(saved).toHaveLength(1);
      expect(saved[0].anchor).toMatchObject({ v: 2, format: "epub" });
      expect(saved[0].anchor.cfi).toMatch(/^epubcfi\(/);
      expect(saved[0].anchor.href).toBeTruthy();
      expect(saved[0].anchor.quote.exact).toBe(selected.replace(/\s+/g, " ").trim());

      await page.reload();
      await bookFrame(page);
      await expect(page.locator("[data-highlights-drawn]")).toHaveAttribute("data-highlights-drawn", "1");
    });
  });
}

test.describe("Book documents are untrusted", () => {
  test.skip(!ids.englishEpub, "englishEpub is not in READER_BOOKS");

  test("the reader page sends its policy, and a script in a chapter does not run", async ({ page }) => {
    const response = await page.goto(readPath(ids.englishEpub!));
    const policy = (await response!.allHeaders())["content-security-policy"] ?? "";
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).toContain("frame-ancestors 'self'");

    await bookFrame(page);
    // a chapter as foliate loads one: a blob document in a same-origin frame that may run scripts,
    // with a script tag and an inline handler written into its markup
    const ran = await page.evaluate(async () => {
      const w = window as unknown as { __bookScript?: boolean; __bookHandler?: boolean };
      const markup = '<html><body><p>chapter</p><script>parent.__bookScript = true</script>' +
        '<img src="data:," onerror="parent.__bookHandler = true" onload="parent.__bookHandler = true"></body></html>';
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
      frame.src = URL.createObjectURL(new Blob([markup], { type: "text/html" }));
      document.body.append(frame);
      await new Promise((r) => setTimeout(r, 800));
      return { script: w.__bookScript === true, handler: w.__bookHandler === true };
    });
    expect(ran).toEqual({ script: false, handler: false });
  });
});

