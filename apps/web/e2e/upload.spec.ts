import { test, expect } from "@playwright/test";
import { bookPath, hasBook, type BookKey } from "./books";

/** The upload form reads a book's metadata in the browser, with the parser the reader uses; nothing is uploaded. */
const cases: [BookKey, string, RegExp][] = [
  ["englishEpub", "The Problems of Philosophy", /Bertrand Russell/],
  ["russianEpub", "Московия в представлении иностранцев XVI-XVII в.", /Apostol/],
];

for (const [key, title, author] of cases) {
  test(`the upload form fills in the title, author, pages and cover of ${key}`, async ({ page }) => {
    test.skip(!hasBook(key), `${key} is not in READER_BOOKS`);
    await page.goto("/apps/reader/upload");
    await page.locator('input[type="file"]').first().setInputFiles(bookPath(key));

    await expect(page.getByText(/^\d+ pages$/)).toBeVisible();
    await expect(page.getByRole("img", { name: "Cover" })).toHaveAttribute("src", /^data:image\//);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByPlaceholder("Enter book title")).toHaveValue(title);
    await expect(page.getByPlaceholder("Enter author name")).toHaveValue(author);
  });
}
