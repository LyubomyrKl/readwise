"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { MasteryBadge, AgingWarning } from "./MasteryBadge";
import { CreateCardsButton } from "./CreateCardsButton";
import type { DictionaryEntryResponse } from "@/lib/types";

interface EntryCardProps {
  entry: DictionaryEntryResponse;
  onCardsCreated?: () => void;
}

export function EntryCard({ entry, onCardsCreated }: EntryCardProps) {
  const collocationsPreview = entry.collocations
    .slice(0, 3)
    .map((c) => c.phrase)
    .join(", ");

  return (
    <Card className="p-4 hover:bg-muted/30 transition-colors">
      <Link href={`/dictionary/${entry.id}`} className="block">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-lg">{entry.word}</span>
              {entry.partOfSpeech && (
                <span className="text-xs text-muted-foreground italic">
                  {entry.partOfSpeech}
                </span>
              )}
              <MasteryBadge level={entry.masteryLevel} />
              <AgingWarning
                createdAt={entry.createdAt}
                masteryLevel={entry.masteryLevel}
              />
            </div>

            {/* Definition */}
            <p className="text-sm text-muted-foreground mb-2">
              {entry.definition}
            </p>

            {/* Personal example */}
            <p className="text-sm italic text-foreground/80 mb-2">
              "{entry.personalExample}"
            </p>

            {/* Collocations preview */}
            {entry.collocations.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Collocations:</span>{" "}
                {collocationsPreview}
                {entry.collocations.length > 3 && (
                  <span> +{entry.collocations.length - 3} more</span>
                )}
              </div>
            )}

            {/* Tags */}
            {entry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {entry.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 bg-muted rounded-full"
                  >
                    {tag}
                  </span>
                ))}
                {entry.tags.length > 5 && (
                  <span className="text-xs text-muted-foreground">
                    +{entry.tags.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 self-start sm:self-auto" onClick={(e) => e.preventDefault()}>
            <CreateCardsButton
              entryId={entry.id}
              hasCards={entry.cardsCount > 0}
              onSuccess={onCardsCreated}
              variant="outline"
              size="sm"
            />
          </div>
        </div>
      </Link>
    </Card>
  );
}
