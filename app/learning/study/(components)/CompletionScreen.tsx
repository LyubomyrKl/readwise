"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, Trophy, ArrowRight } from "lucide-react";

interface CompletionScreenProps {
  stats: {
    reviewed: number;
    correct: number;
    incorrect: number;
    totalTimeMs: number;
  };
  onFinish: () => void;
  onContinue: () => void;
}

export function CompletionScreen({
  stats,
  onFinish,
  onContinue,
}: CompletionScreenProps) {
  const accuracy =
    stats.reviewed > 0
      ? Math.round((stats.correct / stats.reviewed) * 100)
      : 0;
  const avgTimeSeconds =
    stats.reviewed > 0
      ? Math.round(stats.totalTimeMs / stats.reviewed / 1000)
      : 0;

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
            <Trophy className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl">Session Complete!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted">
              <div className="text-3xl font-bold">{stats.reviewed}</div>
              <div className="text-sm text-muted-foreground">Cards Reviewed</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted">
              <div className="text-3xl font-bold">{accuracy}%</div>
              <div className="text-sm text-muted-foreground">Accuracy</div>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                Correct
              </span>
              <span className="font-medium">{stats.correct}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="flex items-center gap-2 text-red-600">
                <XCircle className="h-4 w-4" />
                Incorrect
              </span>
              <span className="font-medium">{stats.incorrect}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                Avg. Response Time
              </span>
              <span className="font-medium">{avgTimeSeconds}s</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onFinish} className="flex-1">
              Finish
            </Button>
            <Button onClick={onContinue} className="flex-1">
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
