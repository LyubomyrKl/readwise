import { chipIds, exactNote, matchNotes, quickMovement, shiftDate, type QuickFields } from "@tools/money/lib/quick";
import type { HabitNote } from "@tools/money/types";

const note = (text: string): HabitNote => ({
  note: text,
  count: 1,
  lastDate: "2026-11-01",
  categoryId: null,
  accountId: null,
  toAccountId: null,
  amount: null,
});

describe("quick entry", () => {
  it("suggests the notes that start with what is typed, then those that contain it", () => {
    const notes = [note("Coffee"), note("Ticket for the Lidl party"), note("Lidl"), note("Lidl Express")];
    expect(matchNotes(notes, "lid").map((n) => n.note)).toEqual(["Lidl", "Lidl Express", "Ticket for the Lidl party"]);
    expect(matchNotes(notes, "  ")).toEqual([]);
    expect(exactNote(notes, "LIDL ")?.note).toBe("Lidl");
    expect(exactNote(notes, "Lid")).toBeUndefined();
  });

  it("offers the picked one, then the most used, then fills up while the history is short", () => {
    const known = ["a", "b", "c", "d", "e"];
    expect(chipIds(["c", "archived", "a"], known, "", 3)).toEqual(["c", "a", "b"]);
    expect(chipIds(["c", "a"], known, "e", 3)).toEqual(["e", "c", "a"]);
    expect(chipIds([], known, "", 2)).toEqual(["a", "b"]);
  });

  it("moves a date by whole days", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("makes the movement, or says what is missing", () => {
    const f: QuickFields = {
      kind: "expense",
      date: "2026-11-20",
      note: " Lidl ",
      amount: "45,20",
      currency: "PLN",
      accountId: "mbank",
      categoryId: "groceries",
      toAccountId: "",
      toCurrency: "",
      amountIn: "",
      fee: "",
    };
    expect(quickMovement(f)).toEqual({
      kind: "expense",
      input: { date: "2026-11-20", note: "Lidl", accountId: "mbank", currency: "PLN", amount: "45.20", categoryId: "groceries" },
    });
    expect(quickMovement({ ...f, amount: "" })).toBe("Enter the amount");
    expect(quickMovement({ ...f, amount: "0" })).toBe("Enter the amount");
    expect(quickMovement({ ...f, accountId: "" })).toBe("Pick an account");
    expect(quickMovement({ ...f, fee: "2" })).toMatchObject({ input: { fee: "2" } });
    expect(quickMovement({ ...f, kind: "income", fee: "2" })).not.toHaveProperty("input.fee");
  });

  it("makes a transfer, an exchange within one account too", () => {
    const t: QuickFields = {
      kind: "transfer",
      date: "2026-11-20",
      note: "",
      amount: "300",
      currency: "PLN",
      accountId: "mbank",
      categoryId: "groceries",
      toAccountId: "savings",
      toCurrency: "PLN",
      amountIn: "",
      fee: "",
    };
    expect(quickMovement(t)).toEqual({
      kind: "transfer",
      input: { date: "2026-11-20", fromAccountId: "mbank", fromCurrency: "PLN", amountOut: "300", toAccountId: "savings", toCurrency: "PLN" },
    });
    expect(quickMovement({ ...t, toAccountId: "mbank" })).toBe("Pick another account to move the money to");
    expect(quickMovement({ ...t, toAccountId: "mbank", toCurrency: "EUR", amountIn: "70" })).toMatchObject({ input: { amountIn: "70" } });
    expect(quickMovement({ ...t, toCurrency: "EUR" })).toBe("Enter the amount received");
    expect(quickMovement({ ...t, fee: "300" })).toBe("The fee must be less than the amount sent");
  });
});
