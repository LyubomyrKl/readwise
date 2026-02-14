"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useDictionaryEntries, useDictionaryStats } from "@/hooks/useDictionary";
import { EntryCard } from "./components/EntryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Search } from "lucide-react";

export default function DictionaryPage() {
  const { entries, isLoading, fetchEntries } = useDictionaryEntries();
  const { stats } = useDictionaryStats();
  const [searchQuery, setSearchQuery] = useState("");
  const [masteryFilter, setMasteryFilter] = useState<string>("all");

  const filteredEntries = useMemo(() => {
    let result = entries;

    // Text search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (entry) =>
          entry.word.toLowerCase().includes(query) ||
          entry.definition.toLowerCase().includes(query) ||
          entry.personalExample.toLowerCase().includes(query) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Mastery filter
    if (masteryFilter !== "all") {
      const level = parseInt(masteryFilter, 10);
      result = result.filter((entry) => entry.masteryLevel === level);
    }

    return result;
  }, [entries, searchQuery, masteryFilter]);

  const handleCardsCreated = () => {
    fetchEntries();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Dictionary</h1>
          {stats && (
            <p className="text-sm text-muted-foreground">
              {stats.totalEntries} entries &bull; {stats.entriesWithCards} with
              cards
              {stats.entriesNeedingCards > 0 && (
                <>
                  {" "}&bull;{" "}
                  <span className="text-amber-500">
                    {stats.entriesNeedingCards} need cards
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <Link href="/dictionary/new" className="sm:flex-shrink-0">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Word
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search words..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={masteryFilter} onValueChange={setMasteryFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by mastery" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entries</SelectItem>
            <SelectItem value="0">⚪ No cards</SelectItem>
            <SelectItem value="1">🟡 Learning</SelectItem>
            <SelectItem value="2">🟢 Mature</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Entries List */}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {entries.length === 0
              ? "Your dictionary is empty. Add your first word to start learning!"
              : "No entries match your search."}
          </p>
          {entries.length === 0 && (
            <Link href="/dictionary/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add First Word
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onCardsCreated={handleCardsCreated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
