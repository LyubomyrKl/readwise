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

const CARD_TYPE_CONFIG = {
  recognition: { label: "Recognition", color: "bg-blue-500" },
  production: { label: "Production", color: "bg-green-500" },
  cloze: { label: "Cloze", color: "bg-purple-500" },
  grammar: { label: "Grammar", color: "bg-orange-500" },
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

  const typeConfig = CARD_TYPE_CONFIG[card.cardType];
  const isHesitant = responseTimeMs > HESITATION_THRESHOLD;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Badge className={cn("text-white", typeConfig.color)}>
          {typeConfig.label}
        </Badge>
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
          {/* Front */}
          <div className="text-center mb-6">
            <div className="text-lg whitespace-pre-wrap leading-relaxed">
              {formatCardText(card.front)}
            </div>
          </div>

          {/* Divider when revealed */}
          {isRevealed && <div className="border-t my-4" />}

          {/* Back */}
          {isRevealed && (
            <div className="text-center text-muted-foreground">
              <div className="whitespace-pre-wrap leading-relaxed">
                {formatCardText(card.back)}
              </div>
            </div>
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
                  <span className="text-xs opacity-80">&lt;10m</span>
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAnswer("hard")}
              disabled={isSubmitting}
              className="flex flex-col h-auto py-3"
            >
              <span className="font-medium">Hard</span>
              <span className="text-xs opacity-80">~1h</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleAnswer("good")}
              disabled={isSubmitting}
              className="flex flex-col h-auto py-3"
            >
              <span className="font-medium">Good</span>
              <span className="text-xs opacity-80">~12h</span>
            </Button>
            <Button
              onClick={() => handleAnswer("easy")}
              disabled={isSubmitting}
              className="flex flex-col h-auto py-3 bg-green-600 hover:bg-green-700 text-white"
            >
              <span className="font-medium">Easy</span>
              <span className="text-xs opacity-80">3d+</span>
            </Button>
          </div>
        )}
      </div>

      {/* Hesitation warning */}
      {isHesitant && !isRevealed && (
        <p className="text-center text-amber-500 text-sm mt-2">
          Taking a while? Hesitation indicates weaker memory.
        </p>
      )}
    </div>
  );
}

// Format card text with markdown-like bold
function formatCardText(text: string): React.ReactNode {
  // Split by **text** pattern
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // Handle _italic_ pattern
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return (
        <em key={i} className="text-muted-foreground">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
