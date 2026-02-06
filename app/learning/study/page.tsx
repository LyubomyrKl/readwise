"use client";

import { useState, useEffect, useCallback } from "react";
import { useStudyQueue, useStudySession, useReview } from "@/hooks/useLearning";
import { StudyCard } from "./(components)/StudyCard";
import { SessionProgress } from "./(components)/SessionProgress";
import { CompletionScreen } from "./(components)/CompletionScreen";
import { EmptyQueue } from "./(components)/EmptyQueue";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import type { LearningCardResponse, ReviewRating } from "@/lib/types";

export default function StudyPage() {
  const { queue, isLoading: queueLoading, refetch: refetchQueue } = useStudyQueue();
  const { isActive, startSession, endSession } = useStudySession();
  const { submitReview, isSubmitting } = useReview();

  const [cards, setCards] = useState<LearningCardResponse[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionStats, setSessionStats] = useState({
    reviewed: 0,
    correct: 0,
    incorrect: 0,
    totalTimeMs: 0,
  });
  const [isComplete, setIsComplete] = useState(false);

  // Build card queue when data loads
  useEffect(() => {
    if (queue && !isActive) {
      // Interleave cards: learning first, then new and review mixed
      const allCards = [
        ...queue.learningCards,
        ...interleaveArrays(queue.newCards, queue.reviewCards),
      ];
      setCards(allCards);
      setCurrentIndex(0);
      setIsComplete(false);
      setSessionStats({ reviewed: 0, correct: 0, incorrect: 0, totalTimeMs: 0 });
    }
  }, [queue, isActive]);

  const handleStartStudy = async () => {
    await startSession();
  };

  const handleAnswer = useCallback(
    async (
      rating: ReviewRating,
      responseTimeMs: number,
      wasHesitant: boolean
    ) => {
      const currentCard = cards[currentIndex];
      if (!currentCard) return;

      try {
        await submitReview({
          cardId: currentCard.id,
          rating,
          responseTimeMs,
          wasHesitant,
        });

        const isCorrect = rating !== "again";
        setSessionStats((prev) => ({
          reviewed: prev.reviewed + 1,
          correct: prev.correct + (isCorrect ? 1 : 0),
          incorrect: prev.incorrect + (isCorrect ? 0 : 1),
          totalTimeMs: prev.totalTimeMs + responseTimeMs,
        }));

        // Move to next card
        if (currentIndex + 1 >= cards.length) {
          setIsComplete(true);
          await endSession();
        } else {
          setCurrentIndex((prev) => prev + 1);
        }
      } catch (error) {
        console.error("Failed to submit review:", error);
      }
    },
    [cards, currentIndex, submitReview, endSession]
  );

  const handleFinish = async () => {
    await endSession();
    await refetchQueue();
    setIsComplete(false);
  };

  const handleContinue = async () => {
    await refetchQueue();
    setIsComplete(false);
  };

  if (queueLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!queue || cards.length === 0) {
    return <EmptyQueue />;
  }

  if (isComplete) {
    return (
      <CompletionScreen
        stats={sessionStats}
        onFinish={handleFinish}
        onContinue={handleContinue}
      />
    );
  }

  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">Ready to Study</h1>
          <p className="text-muted-foreground">
            {queue.totalDue} cards due ({queue.newAvailable} new,{" "}
            {queue.reviewsAvailable} reviews)
          </p>
        </div>
        <Button size="lg" onClick={handleStartStudy}>
          <Play className="h-5 w-5 mr-2" />
          Start Session
        </Button>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <div className="max-w-3xl mx-auto">
      <SessionProgress
        current={currentIndex + 1}
        total={cards.length}
        correct={sessionStats.correct}
        incorrect={sessionStats.incorrect}
      />

      <div className="mt-8">
        <StudyCard
          key={currentCard.id}
          card={currentCard}
          onAnswer={handleAnswer}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}

// Helper to interleave two arrays
function interleaveArrays<T>(a: T[], b: T[]): T[] {
  const result: T[] = [];
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < a.length) result.push(a[i]);
    if (i < b.length) result.push(b[i]);
  }
  return result;
}
