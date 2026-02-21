"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, X, Link2, Search, Plus, Check } from "lucide-react";
import Link from "next/link";
import type { DictionarySearchResult } from "@/lib/types";

interface SynonymSelectorEditProps {
  selectedSynonyms: DictionarySearchResult[];
  onChange: (synonyms: DictionarySearchResult[]) => void;
}

export function SynonymSelectorEdit({ selectedSynonyms, onChange }: SynonymSelectorEditProps) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DictionarySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchWords = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/dictionary/search?q=${encodeURIComponent(query)}`, {
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
    setSearch(value);
    setIsOpen(true);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchWords(value);
    }, 200);
  };

  const handleAdd = (entry: DictionarySearchResult) => {
    if (!selectedSynonyms.find((s) => s.id === entry.id)) {
      onChange([...selectedSynonyms, entry]);
    }
    setSearch("");
    setResults([]);
    inputRef.current?.focus();
  };

  const handleRemove = (entryId: string) => {
    onChange(selectedSynonyms.filter((s) => s.id !== entryId));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && search === "" && selectedSynonyms.length > 0) {
      onChange(selectedSynonyms.slice(0, -1));
    }
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearch("");
    }
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      const available = results.find((r) => !selectedSynonyms.find((s) => s.id === r.id));
      if (available) {
        handleAdd(available);
      }
    }
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
    <div className="space-y-2" ref={containerRef}>
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Link as Synonyms
        </Label>
        <Link href="/dictionary/synonyms" className="text-xs text-primary hover:underline">
          Manage synonyms
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Link this word with existing words as synonyms (optional)
      </p>

      {/* Chip input container */}
      <div
        className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background min-h-[42px] cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Selected chips */}
        {selectedSynonyms.map((synonym) => (
          <div
            key={synonym.id}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs sm:text-sm bg-primary/10"
          >
            <Link2 className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate max-w-[80px] sm:max-w-[120px] font-medium">
              {synonym.word}
            </span>
            {synonym.partOfSpeech && (
              <span className="text-muted-foreground text-xs hidden sm:inline">
                ({synonym.partOfSpeech})
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(synonym.id);
              }}
              className="hover:bg-black/10 rounded-full p-0.5 transition-colors -mr-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {/* Search input */}
        <div className="flex-1 min-w-[100px] sm:min-w-[120px] relative">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={handleInputChange}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedSynonyms.length === 0 ? "Search words to link..." : ""}
            className="w-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground py-0.5"
          />
          {isSearching && (
            <Loader2 className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (search.length > 0 || results.length > 0) && (
        <div className="relative">
          <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg max-h-[40vh] sm:max-h-48 overflow-y-auto">
            {results.length === 0 && !isSearching && search.length > 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No words found
              </div>
            )}
            {results.map((entry) => {
              const isSelected = selectedSynonyms.find((s) => s.id === entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => !isSelected && handleAdd(entry)}
                  disabled={!!isSelected}
                  className={`w-full px-3 py-2.5 sm:py-2 text-left hover:bg-muted/50 active:bg-muted flex items-center gap-2 transition-colors ${
                    isSelected ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{entry.word}</span>
                      {entry.partOfSpeech && (
                        <span className="text-xs text-muted-foreground">
                          ({entry.partOfSpeech})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
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
        </div>
      )}
    </div>
  );
}
