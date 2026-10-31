"use client";

import { List, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TocItem } from "../engines/types";

type Props = {
  toc: TocItem[];
  current?: string;
  onSelect: (item: TocItem) => void;
  onClose: () => void;
};

/** The book's own table of contents (EPUB nav or NCX; PDF outline). */
export default function TocPanel({ toc, current, onSelect, onClose }: Props) {
  return (
    <aside className="reader-panel left-0" aria-label="Table of contents">
      <header className="reader-panel-header">
        <h2 className="flex items-center gap-2 font-semibold">
          <List className="h-4 w-4" /> Contents
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close contents">
          <X className="h-4 w-4" />
        </Button>
      </header>
      <nav className="flex-1 overflow-y-auto p-2">
        {toc.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">This book has no table of contents.</p>
        ) : (
          <ul>
            {toc.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
                    current && item.label === current ? "bg-muted font-medium" : ""
                  }`}
                  style={{ paddingLeft: `${0.5 + item.level * 1}rem` }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
