"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchHit } from "../engines/types";

type Props = {
  search: (query: string) => AsyncGenerator<SearchHit>;
  onSelect: (hit: SearchHit) => void;
  onClose: () => void;
};

const MAX_HITS = 500;

/** In-book search through the engine; hits arrive as the book is searched. */
export default function SearchPanel({ search, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const run = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++run.current;
    setHits([]);
    setDone(false);
    setRunning(true);
    const found: SearchHit[] = [];
    try {
      for await (const hit of search(q)) {
        if (id !== run.current) return;
        found.push(hit);
        if (found.length % 10 === 1 || found.length <= 10) setHits([...found]);
        if (found.length >= MAX_HITS) break;
      }
    } finally {
      if (id === run.current) {
        setHits([...found]);
        setRunning(false);
        setDone(true);
      }
    }
  };

  return (
    <aside className="reader-panel right-0" aria-label="Search in the book">
      <header className="reader-panel-header">
        <h2 className="flex items-center gap-2 font-semibold">
          <Search className="h-4 w-4" /> Search
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close search">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <form onSubmit={start} className="flex gap-2 p-3">
        <Input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Words in the book" aria-label="Search for" />
        <Button type="submit" disabled={query.trim().length < 2}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
        </Button>
      </form>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {done && hits.length === 0 && <p className="text-sm text-muted-foreground">Nothing found.</p>}
        {hits.length > 0 && (
          <p className="mb-2 text-xs text-muted-foreground">
            {hits.length >= MAX_HITS ? `First ${MAX_HITS} matches` : `${hits.length} match${hits.length === 1 ? "" : "es"}`}
            {running ? ", still searching…" : ""}
          </p>
        )}
        <ul className="space-y-1">
          {hits.map((hit, i) => (
            <li key={i}>
              <button type="button" onClick={() => onSelect(hit)} className="w-full rounded-md p-2 text-left text-sm hover:bg-muted">
                {hit.label && <span className="mb-0.5 block text-xs text-muted-foreground">{hit.label}</span>}
                <span>
                  …{hit.excerpt.pre}
                  <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-700">{hit.excerpt.match}</mark>
                  {hit.excerpt.post}…
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
