"use client";

import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle } from "lucide-react";

interface SessionProgressProps {
  current: number;
  total: number;
  correct: number;
  incorrect: number;
}

export function SessionProgress({
  current,
  total,
  correct,
  incorrect,
}: SessionProgressProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Card {current} of {total}
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-green-600">
            <CheckCircle className="h-4 w-4" />
            {correct}
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <XCircle className="h-4 w-4" />
            {incorrect}
          </span>
        </div>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}
