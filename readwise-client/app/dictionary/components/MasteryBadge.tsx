"use client";

import { cn } from "@/lib/utils";

interface MasteryBadgeProps {
  level: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const masteryConfig = {
  0: { icon: "⚪", label: "No cards", color: "text-gray-400" },
  1: { icon: "🟡", label: "Learning", color: "text-yellow-500" },
  2: { icon: "🟢", label: "Mature", color: "text-green-500" },
};

export function MasteryBadge({ level, showLabel = false, size = "md" }: MasteryBadgeProps) {
  const config = masteryConfig[level as keyof typeof masteryConfig] || masteryConfig[0];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        size === "sm" ? "text-sm" : "text-base"
      )}
      title={config.label}
    >
      <span>{config.icon}</span>
      {showLabel && (
        <span className={cn("text-xs", config.color)}>{config.label}</span>
      )}
      <span className="text-xs text-muted-foreground">{level}</span>
    </span>
  );
}

interface AgingWarningProps {
  createdAt: string;
  masteryLevel: number;
}

export function AgingWarning({ createdAt, masteryLevel }: AgingWarningProps) {
  if (masteryLevel > 0) return null;

  const created = new Date(createdAt);
  const now = new Date();
  const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceCreated < 3) return null;

  return (
    <span className="text-amber-500" title="Entry older than 3 days without cards">
      ⚠️
    </span>
  );
}
