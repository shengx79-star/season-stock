import { Season, seasonLabels, seasonEmojis } from "@/lib/stockData";
import { ConfidenceLevel } from "@/lib/stockClassifier";

interface SeasonBadgeProps {
  season: Season;
  size?: "sm" | "md";
  confidence?: number;
  confidenceLevel?: ConfidenceLevel;
}

const confidenceColors: Record<ConfidenceLevel, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-red-400",
};

export const SeasonBadge = ({ season, size = "md", confidence, confidenceLevel }: SeasonBadgeProps) => {
  const cls = `season-badge-${season}`;
  return (
    <span className={`${cls} ${size === "sm" ? "text-xs px-2 py-0.5" : ""} flex items-center gap-1.5`}>
      {seasonEmojis[season]} {seasonLabels[season]}
      {confidenceLevel && (
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${confidenceColors[confidenceLevel]}`}
          title={`置信度: ${confidence !== undefined ? (confidence * 100).toFixed(0) : "?"}%`}
        />
      )}
    </span>
  );
};
