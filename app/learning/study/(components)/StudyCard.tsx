"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Eye, Clock, Loader2 } from "lucide-react";
import type { LearningCardResponse, ReviewRating } from "@/lib/types";

interface StudyCardProps {
  card: LearningCardResponse;
  onAnswer: (
    rating: ReviewRating,
    responseTimeMs: number,
    wasHesitant: boolean
  ) => void;
  isSubmitting: boolean;
}

const CARD_TYPE_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  recognition: {
    label: "Recognition",
    color: "bg-blue-500",
    description: "What does this mean?"
  },
  production: {
    label: "Production",
    color: "bg-green-500",
    description: "Recall the word from meaning"
  },
};

const HESITATION_THRESHOLD = 8000; // 8 seconds

export function StudyCard({ card, onAnswer, isSubmitting }: StudyCardProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [responseTimeMs, setResponseTimeMs] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setIsRevealed(false);
    setResponseTimeMs(0);

    intervalRef.current = setInterval(() => {
      setResponseTimeMs(Date.now() - startTimeRef.current);
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [card.id]);

  const handleReveal = () => {
    setIsRevealed(true);
  };

  const handleAnswer = (rating: ReviewRating) => {
    const finalTime = Date.now() - startTimeRef.current;
    const wasHesitant = finalTime > HESITATION_THRESHOLD && rating !== "again";
    onAnswer(rating, finalTime, wasHesitant);
  };

  const typeConfig = CARD_TYPE_CONFIG[card.cardType] || CARD_TYPE_CONFIG.recognition;
  const isHesitant = responseTimeMs > HESITATION_THRESHOLD;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge className={cn("text-white", typeConfig.color)}>
            {typeConfig.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {typeConfig.description}
          </span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 text-sm",
            isHesitant ? "text-amber-500" : "text-muted-foreground"
          )}
        >
          <Clock className="h-4 w-4" />
          {(responseTimeMs / 1000).toFixed(1)}s
        </div>
      </div>

      {/* Card */}
      <Card className="min-h-[300px] flex flex-col">
        <CardContent className="flex-1 flex flex-col justify-center p-6">
          {/* Front - Question */}
          <div className="text-center mb-6">
            <div className="text-lg whitespace-pre-wrap leading-relaxed">
              {formatCardText(card.front)}
            </div>
          </div>

          {/* Divider when revealed */}
          {isRevealed && (
            <>
              <div className="border-t my-4" />
              {/* Back - Answer */}
              <div className="text-center">
                <div className="text-lg font-medium text-primary whitespace-pre-wrap leading-relaxed">
                  {formatCardText(card.back)}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="mt-4">
        {!isRevealed ? (
          <Button onClick={handleReveal} className="w-full" size="lg">
            <Eye className="mr-2 h-4 w-4" />
            Show Answer
          </Button>
        ) : (
          <div className="space-y-3">
            {/* Self-assessment prompt */}
            <p className="text-center text-sm text-muted-foreground">
              {card.cardType === "production"
                ? "Did you recall the correct word?"
                : "Did you know the meaning?"}
            </p>

            <div className="grid grid-cols-4 gap-2">
              <Button
                variant="destructive"
                onClick={() => handleAnswer("again")}
                disabled={isSubmitting}
                className="flex flex-col h-auto py-3"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span className="font-medium">Again</span>
                    <span className="text-xs opacity-80">Forgot</span>
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleAnswer("hard")}
                disabled={isSubmitting}
                className="flex flex-col h-auto py-3 border-orange-300 text-orange-600 hover:bg-orange-50"
              >
                <span className="font-medium">Hard</span>
                <span className="text-xs opacity-80">Struggled</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleAnswer("good")}
                disabled={isSubmitting}
                className="flex flex-col h-auto py-3"
              >
                <span className="font-medium">Good</span>
                <span className="text-xs opacity-80">Got it</span>
              </Button>
              <Button
                onClick={() => handleAnswer("easy")}
                disabled={isSubmitting}
                className="flex flex-col h-auto py-3 bg-green-600 hover:bg-green-700 text-white"
              >
                <span className="font-medium">Easy</span>
                <span className="text-xs opacity-80">Instant</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Hesitation warning */}
      {isHesitant && !isRevealed && (
        <p className="text-center text-amber-500 text-sm mt-2">
          Taking a while? That&apos;s okay - honest self-assessment helps learning.
        </p>
      )}
    </div>
  );
}

/**
 * Format card text with markdown-like formatting:
 * - **bold** for highlighted words/answers
 * - _italic_ for context/examples
 * - [____] for blanks
 */
function formatCardText(text: string): React.ReactNode {
  // Split by patterns and process
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Check for bold **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(
        <strong key={key++} className="text-primary font-semibold">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Check for italic _text_
    const italicMatch = remaining.match(/^_([^_]+)_/);
    if (italicMatch) {
      parts.push(
        <em key={key++} className="text-muted-foreground italic">
          {italicMatch[1]}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Check for blanks [____]
    const blankMatch = remaining.match(/^\[____\]/);
    if (blankMatch) {
      parts.push(
        <span key={key++} className="inline-block min-w-[80px] border-b-2 border-primary mx-1">
          &nbsp;
        </span>
      );
      remaining = remaining.slice(blankMatch[0].length);
      continue;
    }

    // Take next character as plain text
    const nextSpecial = remaining.search(/\*\*|_|\[____\]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Didn't match a pattern, take one character
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}
