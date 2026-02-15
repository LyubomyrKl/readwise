"use client";

import Link from "next/link";
import { useWordLookup } from "@/hooks/useDictionary";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Link2 } from "lucide-react";
import type { RelatedWordResponse } from "@/lib/types";

interface RelatedWordsProps {
  word: string;
}

export function RelatedWords({ word }: RelatedWordsProps) {
  const { data, isLoading, lookupWord } = useWordLookup();

  useEffect(() => {
    if (word) {
      lookupWord(word);
    }
  }, [word, lookupWord]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.relatedWords.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Related Words
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.relatedWords.map((related: RelatedWordResponse) => (
            <Link
              key={related.id}
              href={`/dictionary/${related.id}`}
              className="block p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{related.word}</span>
                    {related.partOfSpeech && (
                      <span className="text-xs text-muted-foreground">
                        ({related.partOfSpeech})
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {related.definition}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {related.sharedGroups.map((groupName) => (
                  <span
                    key={groupName}
                    className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                  >
                    {groupName}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
