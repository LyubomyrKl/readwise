import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { request, type FullConfig } from "@playwright/test";
import { BOOKS, STATE_DIR, bookPath, hasBook, type BookKey } from "./books";

const EMAIL = process.env.READER_EMAIL ?? "reader-tests@example.com";
const PASSWORD = process.env.READER_PASSWORD ?? "reader-tests-password";

/** Signs in (registering the first account on a fresh stack) and uploads the test books once. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0].use.baseURL ?? "https://localhost:18443";
  mkdirSync(STATE_DIR, { recursive: true });
  const api = await request.newContext({ baseURL, ignoreHTTPSErrors: true });

  let auth = await api.post("/api/auth/register", { data: { email: EMAIL, password: PASSWORD, name: "Reader tests" } });
  if (!auth.ok()) auth = await api.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  if (!auth.ok()) throw new Error(`Could not sign in to ${baseURL}: ${auth.status()} ${await auth.text()}`);
  await api.storageState({ path: join(STATE_DIR, "session.json") });

  const existing = (await (await api.get("/api/gw/reader/documents")).json()) as { id: string; title: string }[];
  const ids: Partial<Record<BookKey, string>> = {};
  const uploaded: string[] = [];
  for (const key of Object.keys(BOOKS) as BookKey[]) {
    if (!hasBook(key)) continue;
    const book = BOOKS[key];
    const found = existing.find((b) => b.title === book.title);
    if (found) {
      ids[key] = found.id;
      continue;
    }
    const response = await api.post("/api/gw/reader/documents/upload", {
      multipart: {
        book: { name: book.file, mimeType: book.mime, buffer: readFileSync(bookPath(key)) },
        title: book.title,
        author: "Test",
        description: "Uploaded by the reader browser tests",
      },
    });
    if (!response.ok()) throw new Error(`Upload of ${book.file} failed: ${response.status()} ${await response.text()}`);
    ids[key] = ((await response.json()) as { bookId: string }).bookId;
    uploaded.push(ids[key]!);
  }
  // the reader reads parts of the structure reader.ingest writes after an upload (chapter names)
  for (const id of uploaded) {
    for (let tries = 0; tries < 60 && !(await api.get(`/api/gw/reader/documents/${id}/structure`)).ok(); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  writeFileSync(join(STATE_DIR, "books.json"), JSON.stringify(ids, null, 2));
  await api.dispose();
}
