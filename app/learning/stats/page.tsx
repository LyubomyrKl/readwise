"use client";

import { useLearningStats } from "@/hooks/useLearning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Target,
  BookOpen,
  Brain,
  TrendingUp,
  Flame,
  AlertTriangle,
  Calendar,
} from "lucide-react";

export default function StatsPage() {
  const { stats, isLoading } = useLearningStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No statistics available yet. Start studying to see your progress!
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Learning Statistics</h1>
        <p className="text-muted-foreground">
          Track your language learning progress
        </p>
      </div>

      {/* Imbalance Warning */}
      {stats.imbalanceWarning && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{stats.imbalanceWarning}</AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Target}
          label="Retention Rate"
          value={`${Math.round(stats.retentionRate * 100)}%`}
          subtext="30-day average"
        />
        <MetricCard
          icon={BookOpen}
          label="Usable Vocabulary"
          value={stats.estimatedUsableVocabulary.toString()}
          subtext="words"
        />
        <MetricCard
          icon={Brain}
          label="Production Accuracy"
          value={`${Math.round(stats.productionAccuracy * 100)}%`}
          subtext="L1→L2 success"
        />
        <MetricCard
          icon={Flame}
          label="Current Streak"
          value={stats.currentStreak.toString()}
          subtext="days"
        />
      </div>

      {/* Vocabulary Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vocabulary Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Mature (21+ days)</span>
                <span className="font-medium">{stats.matureVocabulary}</span>
              </div>
              <Progress
                value={
                  (stats.matureVocabulary /
                    (stats.matureVocabulary +
                      stats.youngVocabulary +
                      stats.newCards || 1)) *
                  100
                }
                className="h-2"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Young (learning)</span>
                <span className="font-medium">{stats.youngVocabulary}</span>
              </div>
              <Progress
                value={
                  (stats.youngVocabulary /
                    (stats.matureVocabulary +
                      stats.youngVocabulary +
                      stats.newCards || 1)) *
                  100
                }
                className="h-2 [&>div]:bg-yellow-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>New (unseen)</span>
                <span className="font-medium">{stats.newCards}</span>
              </div>
              <Progress
                value={
                  (stats.newCards /
                    (stats.matureVocabulary +
                      stats.youngVocabulary +
                      stats.newCards || 1)) *
                  100
                }
                className="h-2 [&>div]:bg-blue-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cognitive Load */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily Cognitive Load</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress value={stats.dailyCognitiveLoad} className="h-3" />
            </div>
            <span className="text-2xl font-bold">
              {Math.round(stats.dailyCognitiveLoad)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {stats.dailyCognitiveLoad > 70
              ? "High load - consider taking a break"
              : stats.dailyCognitiveLoad > 40
                ? "Moderate load - good pace"
                : "Low load - room for more reviews"}
          </p>
        </CardContent>
      </Card>

      {/* 7-Day Forecast */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Review Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {stats.reviewsForecast.map((count, i) => {
              const date = new Date();
              date.setDate(date.getDate() + i);
              const dayName = date.toLocaleDateString("en-US", {
                weekday: "short",
              });
              const maxCount = Math.max(...stats.reviewsForecast, 1);
              const height = (count / maxCount) * 100;

              return (
                <div key={i} className="flex flex-col items-center">
                  <div className="h-24 w-full flex items-end justify-center">
                    <div
                      className="w-8 bg-primary rounded-t"
                      style={{ height: `${Math.max(height, 5)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium mt-1">{count}</span>
                  <span className="text-xs text-muted-foreground">
                    {i === 0 ? "Today" : dayName}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
