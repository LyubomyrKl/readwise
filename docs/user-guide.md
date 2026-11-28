# Workbench: user guide

Workbench is a private toolbox with two tools:

- **Reader**: your books (EPUB and PDF), read in the browser with highlights and notes, and
  **abridged editions** made by a local AI: each chapter with a short summary, the text shortened by
  how dense it is, the pictures kept.
- **Money**: every account, movement and investment in one ledger, with reports, bank imports and
  read-only access for Claude.

How it is built and deployed: [`toolbox-architecture-plan.md`](toolbox-architecture-plan.md),
[`deploy.md`](deploy.md). How the edition engine works: [`summarizer-investigation.md`](summarizer-investigation.md).

## 1. The pieces

| Piece | Where | What you do with it |
|---|---|---|
| The app | the Hetzner server, private to your tailnet | open it in the browser |
| The AI (Ollama with Gemma 4 and Qwen 3.6) | your Mac | start it when you want editions made |
| Your devices | phone, laptop | must be on your Tailscale network to reach the app |

Nothing leaves your machines: books, editions and money data stay on the server; the AI runs on the
Mac.

## 2. Open the app

1. Make sure Tailscale is on, on the device you use.
2. Open **https://summarizer.tail4388a5.ts.net:8443** (always `https`, with `:8443`).
3. Sign in. The first account is the only one; registration is closed after it.

Make the account safer under **Settings → Account**: an authenticator app (6-digit codes) and/or a
passkey (Face ID, Touch ID). On a phone, "Add to Home Screen" gives it an app icon.

## 3. Start the AI on the Mac (only for editions)

Reading and money work without it. Editions need it. In Terminal on the Mac:

```bash
OLLAMA_CONTEXT_LENGTH=32768 OLLAMA_FLASH_ATTENTION=1 OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

- Leave the window open while an edition is being made, and keep the Mac awake (plugged in, lid
  open, or `caffeinate -i` in another window).
- `OLLAMA_HOST=0.0.0.0` lets the server reach the Mac over Tailscale; without it editions stay
  "waiting".
- The models are already pulled: `gemma4:26b-mlx` (writes) and `qwen3.6:35b-mlx` (checks).
  `ollama list` shows them. Ollama switches between them by itself.
- Stop it with `Ctrl+C` when you are done.

## 4. Reader

### Add books

**Library → Add books**, then drop or pick EPUB or PDF files. Title, author and cover are read from
the file; you can edit them before uploading.

Files that work best:

- **EPUB with real text** (most store-bought or library EPUBs).
- **PDF with a text layer** (you can select text in it). Scanned PDFs are read by the AI page by page
  when an edition is made, which is slower.
- A file that is only **pictures of pages** (some free EPUBs are) cannot be read for editions; the
  edition panel then shows "0 of 1 sections". Find another copy of the book.

### Read

Open a book, then **Start Reading** (or **Continue Reading**). Your place is saved as you read and
follows you to other devices; the library shows how far you are in each book.

- **Top bar**: Back, the title and the chapter you are in, **Contents**, **Search**, **Notes and
  highlights** (with a count), **Settings**.
- **Bottom bar**: previous and next page, the progress bar (click or tap anywhere on it to jump
  there), and where you are: the page of a PDF ("xii · 14 / 320" when the book prints its own page
  numbers), or the location in an EPUB.
- **Turn pages** with the arrow keys, Page Up and Page Down, or the buttons. EPUBs turn pages left
  and right, or scroll (Settings → Layout); PDFs scroll.
- **Highlight** in PDFs and EPUBs alike: select text, pick one of five colours, then **Highlight**,
  or **Note** to write a note about it. Tap a highlight to change its colour or delete it. **Notes and
  highlights** lists them; tap one to go to it.
- **Search** (Cmd/Ctrl+F, or the magnifier) finds text in the whole book; tap a result to go there.
- **Settings**: light, sepia or dark; for EPUBs text size, line spacing and pages or scrolling; for
  PDFs zoom and fit to width.
- **Large books open at once**: only the pages you look at are downloaded, so a 200 MB illustrated
  PDF shows its first page in about a second.

Not yet: pinch to zoom a PDF on a phone (use the zoom buttons in Settings), and text in scanned PDFs
(they show, but nothing can be selected).

### Make an abridged edition

1. Start the AI on the Mac (section 3).
2. Open the book and click the purple **Abridged edition** button.
3. Check **What the edition will include**: it lists the book's chapters (for example "24 of 26
   sections"). Front matter such as the copyright page and the index is left out on purpose.
4. Choose:
   - **Length**: *Shorter* (about 12-38% of each part), *Standard* (15-50%, by how dense each part
     is; recommended) or *Longer* (20-55%).
   - **Pictures**: *Key pictures* (captioned, referred to or large; recommended), *All pictures*, or
     *No pictures*.
5. Click **Make abridged edition**.

While it works, the panel shows the steps (writing, checking, correcting, finishing), a list of
chapters with their state, and the time left once it has measured its pace. You can leave and come
back; chapters are kept as they finish.

When it is done, **Read the edition** opens it. The edition is also a book of its own in your library
(an EPUB): you can read it, highlight it and download it.

How long: roughly 10 seconds per 1,000 words for English and 15 for Russian or Ukrainian, about three
times that with all the checks (the default). A 300-page book takes about an hour. These are
estimates; the panel shows the real pace.

If it stops:

| You see | Do |
|---|---|
| "Paused: waiting for the LLM host" | The Mac is asleep or Ollama is not running with `OLLAMA_HOST=0.0.0.0`. Start it; the edition continues by itself. |
| "A model is missing on the Mac" | Run the `ollama pull ...` command shown, then **Continue**. |
| "This book has no readable text" | The file is pictures only or has no chapters; use another copy. |
| "The worker stopped while making it" or another error | Click **Continue**: it resumes from the last finished chapter. **Start over** begins again. |

## 5. Money

- **Overview**: net worth, this month, where the money went, the allocation against your targets.
- **Accounts**: bank accounts, cards, cash, brokerage; open one to see its movements and balance.
  An investment or bonds account also shows what it holds, at cost and at value: **Add a holding**
  buys something or records what you already own, and **Update prices** takes prices you enter
  yourself. **Assets and classes** (at the top of Accounts) lists every asset with where it is held
  and its last price, and the classes your allocation targets.
- **Logging a movement**: the **+** button at the bottom right of every money page, the **N** key,
  or **New movement** / **Movement** on a page opens the quick form over the page. Type the amount
  (the cursor is already there), then what it was for: the notes you used before show up as you
  type, and picking one brings back its category and account from last time. Your most used
  categories and accounts are one click away, the account you used last is already picked, and
  **Enter** saves. **Save and add another** keeps the form open for the next one; every save says so
  with an **Undo**. Expense, income and transfers; a trade (buy, sell) has the investments form.
  Amounts are exact; nothing is rounded.
- **Transactions**: the full list. Open a movement to change it (its form, filled in: **Save
  changes**) or to **Delete** it. A posted movement is never edited in place: a change posts a
  correction and a delete a reversal, so the history stays complete (**Show corrections and
  reversals** lists them; they open read-only). **Select** picks several movements (or **All
  shown**, after filtering) to give them one category or delete them together. On a phone the
  filters fold behind **Filters**.
- **Import**: bank statement exports of one account (mBank, PKO BP, ZEN). Check the preview, then
  post. Transfers between your own accounts are recognised by account number.
- **Insights**: where the money is heading. This month on pace: spending and income projected
  as what is in so far plus what usually follows after the last day you have recorded, in your
  own months before (with a likely range), against a usual month, and day by day on a chart; each
  category the same way, the furthest from usual first (one that comes now and then, like a
  holiday, shows its average month instead); the year so far and as projected, against last year;
  net worth in twelve months from what you save in an average month, plus your investments growing
  at the yearly return you pick on the card (0% unless you choose one; past market moves are not
  carried forward); where each month's change of net worth came from (saved, markets and exchange
  rates, one-offs and accounts added); how many months of average spending your bank and cash would
  cover; recurring movements still due this month. Totals over many months (the year, the safety
  net) use the average month, so costs that come a few times a year are counted. Under three months
  of history the month is projected in a straight line; a month with nothing recorded yet shows as
  a usual month. One-offs (a category left out of the totals, such as Sold belongings) are in none
  of the projections, the savings rate or what you save: a sale counts once in today's net worth.
  On the Overview the pace is under Expenses: **on pace for …** opens Insights.
- **Reports**: month by month, by category.
- **Settings → Account**: change your password (the current one first; your other devices sign in
  again with the new one), the authenticator app, passkeys. Forgot it? **Forgot password?** on the
  sign-in page gives a one-time link to set a new one: by email when the server sends email,
  otherwise from the server (docs/deploy.md, Passwords).
- **Settings → Money**: base currency, categories, automation (exchange rates and prices are fetched
  daily, recurring movements are posted on their day).

### Let Claude read your money

**Settings → Money → Claude** creates a read-only token for Claude Code, or connects the Claude app
(claude.ai, desktop, phone) through the approval page. Claude can read net worth, months,
allocation, accounts, transactions and positions; it cannot change anything. Revoke a token in the
same list at any time. Details: [`money/claude-access.md`](money/claude-access.md).

## 6. Settings

| Page | What is there |
|---|---|
| Account | name, password, authenticator app, passkeys, sign out everywhere |
| Appearance | theme (light, dark, system), animations |
| Reader | book cover style in the library |
| Money | base currency, categories, automation, Claude access |

## 7. When something is wrong

| Problem | Cause and fix |
|---|---|
| The app does not open | Tailscale is off on this device, or the address lacks `https://` or `:8443`. |
| Sign-in does nothing, or you are signed out at once | The page was opened over `http`. Use the `https://...:8443` address. |
| An edition stays "waiting" | Start Ollama on the Mac with the command in section 3 and keep the Mac awake. |
| A book shows no chapters | The file has no text layer (pictures only). |
| Something else | Note what you did and the message; the server logs (`docs/deploy.md`) show the rest. |

## 8. Your data

- The database is dumped every night on the server and kept for 14 days; the Mac can fetch copies
  (`docs/deploy.md`, Backups).
- Books, covers and editions are files on the server (MinIO), next to the database.
- Deleting a book deletes its file, cover, notes, highlights and the working files of its editions;
  editions you made stay in the library as books of their own until you delete them.

## 9. What is next

The readers were rebuilt on PDF.js and foliate-js ([`document-architecture.md`](document-architecture.md)).
Next on that foundation: opening the original book at the place an edition paragraph comes from,
showing a book's highlights in its editions, search on the server for very large books, pinch zoom
for PDFs on phones, and a text layer for scanned PDFs.
