"use client";

import { CurrencySelect, Segmented } from "../Fields";

/** "Show in": quick picks for the usual base currencies and a list with every other one. Display only; nothing stored changes. */
export function BasePicker({ value, onChange, suggestions }: { value: string; onChange: (base: string) => void; suggestions: string[] }) {
  const quick = suggestions.includes(value) || !value ? suggestions : [...suggestions, value];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Show in</span>
      {quick.length > 1 ? <Segmented scroll value={value} onChange={onChange} options={quick.map((c) => ({ value: c, label: c }))} /> : null}
      <div className="w-28">
        <CurrencySelect value="" onChange={onChange} placeholder="Other…" />
      </div>
    </div>
  );
}
