"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Plus, Check } from "lucide-react";
import type { DictionarySearchResult } from "@/lib/types";

interface WordSearchProps {
  onSelect: (entry: DictionarySearchResult) => void;
  selectedIds?: string[];
  placeholder?: string;
}

export function WordSearch({ onSelect, selectedIds = [], placeholder = "Search words..." }: WordSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DictionarySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 1) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/dictionary/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Search failed");
      const data = (await response.json()) as DictionarySearchResult[];
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsOpen(true);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      search(value);
    }, 200);
  };

  const handleSelect = (entry: DictionarySearchResult) => {
    onSelect(entry);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="pl-9 pr-9"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && (query.length > 0 || results.length > 0) && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {results.length === 0 && !isSearching && query.length > 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No words found
            </div>
          )}
          {results.map((entry) => {
            const isSelected = selectedIds.includes(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => !isSelected && handleSelect(entry)}
                disabled={isSelected}
                className={`w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center justify-between gap-2 transition-colors ${
                  isSelected ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{entry.word}</span>
                    {entry.partOfSpeech && (
                      <span className="text-xs text-muted-foreground">
                        ({entry.partOfSpeech})
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {entry.definition}
                  </p>
                </div>
                {isSelected ? (
                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
