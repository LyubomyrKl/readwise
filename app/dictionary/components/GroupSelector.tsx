"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSemanticGroups, useEntryGroups } from "@/hooks/useDictionary";
import { Label } from "@/components/ui/label";
import { Loader2, X, Tags } from "lucide-react";
import { toast } from "sonner";

interface GroupSelectorProps {
  entryId: string;
}

export function GroupSelector({ entryId }: GroupSelectorProps) {
  const { groups } = useSemanticGroups();
  const { entryGroups, isUpdating, addToGroups, removeFromGroup, fetchEntryGroups } = useEntryGroups(entryId);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Groups not already assigned to this entry
  const availableGroups = groups.filter(
    (g) => !entryGroups.some((eg) => eg.id === g.id)
  );

  // Filter available groups by search
  const filteredGroups = search.trim()
    ? availableGroups.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.description?.toLowerCase().includes(search.toLowerCase())
      )
    : availableGroups;

  const handleAdd = async (groupId: string) => {
    setIsAdding(true);
    try {
      await addToGroups([groupId]);
      setSearch("");
      toast.success("Added to group");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to group");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (groupId: string) => {
    try {
      await removeFromGroup(groupId);
      toast.success("Removed from group");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove from group");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setSearch("");
    }
    if (e.key === "Enter" && filteredGroups.length > 0) {
      e.preventDefault();
      handleAdd(filteredGroups[0].id);
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

  if (groups.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground flex items-center gap-2">
          <Tags className="h-4 w-4" />
          Word Groups
        </Label>
        <p className="text-sm text-muted-foreground">
          No groups created yet.{" "}
          <Link href="/dictionary/groups" className="text-primary hover:underline">
            Create your first group
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground flex items-center gap-2">
          <Tags className="h-4 w-4" />
          Word Groups
        </Label>
        <Link href="/dictionary/groups" className="text-xs text-primary hover:underline">
          Manage groups
        </Link>
      </div>

      {/* Chip input container */}
      <div
        className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background min-h-[42px] cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Selected chips */}
        {entryGroups.map((group) => (
          <div
            key={group.id}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs sm:text-sm"
            style={{ backgroundColor: `${group.color || "#3B82F6"}25` }}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: group.color || "#3B82F6" }}
            />
            <span className="truncate max-w-[80px] sm:max-w-[120px]">{group.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(group.id);
              }}
              disabled={isUpdating}
              className="hover:bg-black/10 rounded-full p-0.5 transition-colors disabled:opacity-50 -mr-0.5"
            >
              {isUpdating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </button>
          </div>
        ))}

        {/* Search input */}
        <div className="flex-1 min-w-[100px] sm:min-w-[120px] relative">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={entryGroups.length === 0 ? "Search groups..." : "Add..."}
            className="w-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground py-0.5"
            disabled={isAdding}
          />
        </div>

        {isAdding && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && availableGroups.length > 0 && (
        <div className="relative">
          <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg max-h-[40vh] sm:max-h-48 overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No groups match your search
              </div>
            ) : (
              filteredGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => handleAdd(group.id)}
                  disabled={isAdding}
                  className="w-full px-3 py-2.5 sm:py-2 text-left hover:bg-muted/50 active:bg-muted flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: group.color || "#3B82F6" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{group.name}</span>
                    {group.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 sm:mt-0 sm:ml-2 sm:inline">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                    {group.entryCount} words
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
