"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatAmount, today } from "../lib/format";
import { chipIds, exactNote, matchNotes, quickMovement, shiftDate, type QuickFields } from "../lib/quick";
import { errorMessage, useAccounts, useCategories, useHabits, useMoneySettings } from "../queries";
import { MONEY_ROUTES } from "../routes";
import type { HabitKind, HabitNote, Movement, TransactionResponse } from "../types";
import { AccountBalances, accountCurrencies, AccountSelect, AmountInput, categoryPath, CurrencySelect, DateInput, Segmented } from "./Fields";

const KINDS: { value: HabitKind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

const AMOUNT_TYPED = /^[\d\s.,']*$/;

/**
 * Logging a movement in a few keys: the amount first, a note that brings back what it was last
 * time (its category and account), the categories and accounts used most one click away, Enter to
 * save. Expense, income and transfer; a trade keeps the full form.
 */
export function QuickMovementForm({
  initialKind = "expense",
  accountId: presetAccount,
  onSubmit,
  onSaved,
}: {
  initialKind?: HabitKind;
  /** opened from an account: that one, whatever the history says */
  accountId?: string;
  onSubmit: (movement: Movement) => Promise<TransactionResponse>;
  /** `another`: the form stays for the next one */
  onSaved: (tx: TransactionResponse, another: boolean) => void;
}) {
  const [f, setF] = useState<QuickFields>(() => ({
    kind: initialKind,
    date: today(),
    note: "",
    amount: "",
    currency: "",
    accountId: presetAccount ?? "",
    categoryId: "",
    toAccountId: "",
    toCurrency: "",
    amountIn: "",
    fee: "",
  }));
  const set = <K extends keyof QuickFields>(key: K, value: QuickFields[K]) => setF((prev) => ({ ...prev, [key]: value }));
  /** chosen by hand: the history leaves it alone */
  const chosen = useRef({ account: !!presetAccount, toAccount: false, category: false });
  const [feeOpen, setFeeOpen] = useState(false);
  const [allCategories, setAllCategories] = useState(false);
  const [otherAccount, setOtherAccount] = useState<"from" | "to" | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const { data: habits } = useHabits(f.kind);
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: settings } = useMoneySettings();

  const open = useMemo(() => accounts ?? [], [accounts]);
  const isOpen = (id: string | null | undefined): id is string => !!id && open.some((a) => a.id === id);
  const account = open.find((a) => a.id === f.accountId);
  const toAccount = open.find((a) => a.id === f.toAccountId);
  const currencies = accountCurrencies(account);
  const toCurrencies = accountCurrencies(toAccount);
  const preferred = (list: string[]) => (settings && list.includes(settings.baseCurrency) ? settings.baseCurrency : list[0]);
  const named = useMemo(() => {
    const all = categories ?? [];
    return all
      .filter((c) => c.kind === (f.kind === "income" ? "income" : "expense") && !c.archived)
      .map((c) => ({ id: c.id, label: categoryPath(c, all) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [categories, f.kind]);
  const knownCategory = (id: string | null): id is string => !!id && named.some((c) => c.id === id);
  const categoryName = (id: string | null) => named.find((c) => c.id === id)?.label;
  const accountName = (id: string | null) => open.find((a) => a.id === id)?.name;

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // what was not chosen by hand follows the history: the account used last, else the most used
  useEffect(() => {
    if (!habits || !accounts) return;
    const ids = new Set(accounts.map((a) => a.id));
    setF((prev) => {
      let next = prev;
      if (!chosen.current.account && !prev.accountId) {
        const id = [habits.lastAccountId, ...habits.accounts, accounts[0]?.id].find((x) => !!x && ids.has(x));
        if (id) next = { ...next, accountId: id };
      }
      if (next.kind === "transfer" && !chosen.current.toAccount && !next.toAccountId) {
        const id = [habits.lastToAccountId, ...habits.toAccounts].find((x) => !!x && ids.has(x) && x !== next.accountId);
        if (id) next = { ...next, toAccountId: id };
      }
      return next;
    });
  }, [habits, accounts]);

  // each account's currency: the base one when it holds it, else its first
  useEffect(() => {
    if (currencies.length > 0 && !currencies.includes(f.currency)) set("currency", preferred(currencies));
  }, [account, f.currency, settings]);
  useEffect(() => {
    if (toCurrencies.length === 0 || toCurrencies.includes(f.toCurrency)) return;
    set("toCurrency", toCurrencies.includes(f.currency) ? f.currency : preferred(toCurrencies));
  }, [toAccount, f.toCurrency, f.currency, settings]);

  /** what a note was last time; `picked` from the list it wins over what was chosen by hand */
  const learn = (h: HabitNote, picked: boolean) =>
    setF((prev) => ({
      ...prev,
      note: picked ? h.note : prev.note,
      categoryId: (picked || !chosen.current.category) && knownCategory(h.categoryId) ? h.categoryId : prev.categoryId,
      accountId: (picked || !chosen.current.account) && isOpen(h.accountId) ? h.accountId : prev.accountId,
      toAccountId:
        prev.kind === "transfer" && (picked || !chosen.current.toAccount) && isOpen(h.toAccountId) ? h.toAccountId : prev.toAccountId,
      amount: prev.amount || !h.amount ? prev.amount : h.amount.value,
      currency: prev.amount || !h.amount ? prev.currency : h.amount.currency,
    }));

  const suggestions = useMemo(() => matchNotes(habits?.notes ?? [], f.note), [habits, f.note]);
  const listOpen = suggesting && suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0].note === f.note.trim());
  const pick = (h: HabitNote) => {
    learn(h, true);
    setSuggesting(false);
  };
  const onNoteKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(suggestions[Math.min(highlight, suggestions.length - 1)]);
    } else if (e.key === "Escape") {
      setSuggesting(false);
    }
  };

  const chooseCategory = (id: string) => {
    chosen.current.category = true;
    setF((prev) => ({ ...prev, categoryId: prev.categoryId === id ? "" : id }));
    setAllCategories(false);
  };
  const chooseAccount = (side: "from" | "to", id: string) => {
    if (side === "from") {
      chosen.current.account = true;
      set("accountId", id);
    } else {
      chosen.current.toAccount = true;
      set("toAccountId", id);
    }
    setOtherAccount(null);
  };

  async function submit(another: boolean) {
    setError(null);
    const movement = quickMovement(f);
    if (typeof movement === "string") {
      setError(movement);
      return;
    }
    setPending(true);
    try {
      const tx = await onSubmit(movement);
      onSaved(tx, another);
      if (another) {
        chosen.current.category = false;
        setF((prev) => ({ ...prev, amount: "", note: "", categoryId: "", fee: "", amountIn: "" }));
        setFeeOpen(false);
        amountRef.current?.focus();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const transfer = f.kind === "transfer";
  const ids = open.map((a) => a.id);
  const fromChips = chipIds(habits?.accounts ?? [], ids, f.accountId, 4);
  const toChips = chipIds(habits?.toAccounts ?? [], ids.filter((id) => id !== f.accountId), f.toAccountId, 4);
  const categoryChips = chipIds(habits?.categories ?? [], named.map((c) => c.id), f.categoryId, 6);
  const crossCurrency = transfer && !!f.toCurrency && f.toCurrency !== f.currency;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <Segmented
        value={f.kind}
        options={KINDS}
        onChange={(kind) => {
          chosen.current.category = false;
          setF((prev) => ({ ...prev, kind, categoryId: "", fee: "", amountIn: "" }));
          setAllCategories(false);
          setFeeOpen(false);
        }}
      />

      <div className="space-y-1.5">
        <label htmlFor="quick-amount" className="text-sm font-medium">
          {transfer ? "Amount sent" : "Amount"}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="quick-amount"
            ref={amountRef}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={f.amount}
            onChange={(e) => AMOUNT_TYPED.test(e.target.value) && set("amount", e.target.value)}
            className="h-14 text-3xl font-semibold tabular-nums md:text-3xl"
          />
          {currencies.length > 1 ? (
            <div className="w-28 shrink-0">
              <CurrencySelect value={f.currency} onChange={(v) => set("currency", v)} only={currencies} />
            </div>
          ) : (
            <span className="w-12 shrink-0 text-lg text-muted-foreground">{f.currency}</span>
          )}
        </div>
      </div>

      <div className="relative space-y-1.5">
        <label htmlFor="quick-note" className="text-sm font-medium">
          What for
        </label>
        <Input
          id="quick-note"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls="quick-notes"
          aria-autocomplete="list"
          aria-activedescendant={listOpen ? `quick-note-${highlight}` : undefined}
          autoComplete="off"
          placeholder={transfer ? "To savings, rent…" : "Lidl, rent, a coffee…"}
          value={f.note}
          onChange={(e) => {
            const note = e.target.value;
            set("note", note);
            setSuggesting(true);
            setHighlight(0);
            const exact = exactNote(habits?.notes ?? [], note);
            if (exact) learn(exact, false);
          }}
          onKeyDown={onNoteKey}
          onBlur={() => setSuggesting(false)}
        />
        {listOpen ? (
          <ul id="quick-notes" role="listbox" aria-label="From your history" className="absolute z-20 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
            {suggestions.map((s, i) => (
              <li
                key={s.note}
                id={`quick-note-${i}`}
                role="option"
                aria-selected={i === highlight}
                // before the field loses focus, so the pick is not lost
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn("cursor-pointer rounded-sm px-2 py-1.5 text-sm", i === highlight && "bg-muted")}
              >
                <div className="truncate font-medium">{s.note}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[
                    categoryName(s.categoryId),
                    transfer ? [accountName(s.accountId), accountName(s.toAccountId)].filter(Boolean).join(" → ") : accountName(s.accountId),
                    s.amount ? formatAmount(s.amount) : null,
                    s.count > 1 ? `${s.count} times` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {transfer ? null : (
        <ChipRow label="Category" hint={f.categoryId ? undefined : f.kind === "income" ? "None picked: Other income" : "None picked: Other expenses"}>
          {categoryChips.map((id) => (
            <Chip key={id} active={f.categoryId === id} onClick={() => chooseCategory(id)}>
              {categoryName(id)}
            </Chip>
          ))}
          <Chip active={allCategories} onClick={() => setAllCategories((v) => !v)}>
            All…
          </Chip>
          {allCategories ? <CategoryFinder categories={named} onPick={chooseCategory} /> : null}
        </ChipRow>
      )}

      <AccountChips
        label={transfer ? "From" : "Account"}
        chips={fromChips}
        value={f.accountId}
        name={accountName}
        other={otherAccount === "from"}
        onOther={() => setOtherAccount((v) => (v === "from" ? null : "from"))}
        onPick={(id) => chooseAccount("from", id)}
        hint={<AccountBalances account={account} currency={f.currency} />}
      />

      {transfer ? (
        <>
          <AccountChips
            label="To"
            chips={toChips}
            value={f.toAccountId}
            name={accountName}
            other={otherAccount === "to"}
            onOther={() => setOtherAccount((v) => (v === "to" ? null : "to"))}
            onPick={(id) => chooseAccount("to", id)}
            hint={<AccountBalances account={toAccount} currency={f.toCurrency} />}
          />
          {toCurrencies.length > 1 ? (
            <div className="w-40">
              <CurrencySelect value={f.toCurrency} onChange={(v) => set("toCurrency", v)} only={toCurrencies} placeholder="Currency received" />
            </div>
          ) : null}
          {crossCurrency ? (
            <div className="space-y-1.5">
              <label htmlFor="quick-amount-in" className="text-sm font-medium">
                Amount received ({f.toCurrency})
              </label>
              <AmountInput id="quick-amount-in" value={f.amountIn} onChange={(v) => set("amountIn", v)} />
            </div>
          ) : null}
        </>
      ) : null}

      <ChipRow label="Date">
        <Chip active={f.date === today()} onClick={() => set("date", today())}>
          Today
        </Chip>
        <Chip active={f.date === shiftDate(today(), -1)} onClick={() => set("date", shiftDate(today(), -1))}>
          Yesterday
        </Chip>
        <div className="w-40">
          <DateInput id="quick-date" value={f.date} onChange={(v) => set("date", v)} />
        </div>
      </ChipRow>

      {f.kind === "income" ? null : feeOpen ? (
        <div className="space-y-1.5">
          <label htmlFor="quick-fee" className="text-sm font-medium">
            Fee{f.currency ? ` (${f.currency})` : ""}
          </label>
          <AmountInput id="quick-fee" value={f.fee} onChange={(v) => set("fee", v)} />
          <p className="text-xs text-muted-foreground">
            {transfer ? "Taken from the amount sent; booked under Fees." : "Charged on top, e.g. a card currency fee; booked under Fees."}
          </p>
        </div>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setFeeOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Fee
        </button>
      )}

      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div> : null}

      {/* in reach on a phone, under the keyboard's edge: the row sticks to the bottom of the sheet */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-4 py-3">
        <Link href={MONEY_ROUTES.newMovement("buy")} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          A trade? The investments form
        </Link>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => void submit(true)}>
            Save and add another
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ChipRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <div className="text-sm font-medium">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "max-w-[14rem] truncate rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function AccountChips({
  label,
  chips,
  value,
  name,
  other,
  onOther,
  onPick,
  hint,
}: {
  label: string;
  chips: string[];
  value: string;
  name: (id: string) => string | undefined;
  other: boolean;
  onOther: () => void;
  onPick: (id: string) => void;
  hint?: ReactNode;
}) {
  return (
    <ChipRow label={label} hint={hint}>
      {chips.map((id) => (
        <Chip key={id} active={value === id} onClick={() => onPick(id)}>
          {name(id)}
        </Chip>
      ))}
      <Chip active={other} onClick={onOther}>
        Other…
      </Chip>
      {other ? (
        <div className="w-full">
          <AccountSelect value={chips.includes(value) ? "" : value} onChange={onPick} placeholder="Pick an account" />
        </div>
      ) : null}
    </ChipRow>
  );
}

/** Every category of the kind, found by typing; Enter takes the first that matches. */
function CategoryFinder({ categories, onPick }: { categories: { id: string; label: string }[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = categories.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="w-full rounded-md border">
      <div className="relative border-b">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          aria-label="Find a category"
          placeholder="Find a category"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (shown[0]) onPick(shown[0].id);
            }
          }}
          className="h-9 w-full bg-transparent pl-8 pr-2 text-sm outline-none"
        />
      </div>
      <ul className="max-h-48 overflow-y-auto py-1">
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => onPick(c.id)}>
              {c.label}
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-3 py-1.5 text-sm text-muted-foreground">No category by that name</li> : null}
      </ul>
    </div>
  );
}
