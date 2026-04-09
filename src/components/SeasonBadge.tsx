import { Season, seasonLabels, seasonEmojis } from "@/lib/stockData";

interface SeasonBadgeProps {
  season: Season;
  size?: "sm" | "md";
}

export const SeasonBadge = ({ season, size = "md" }: SeasonBadgeProps) => {
  const cls = `season-badge-${season}`;
  return (
    <span className={`${cls} ${size === "sm" ? "text-xs px-2 py-0.5" : ""}`}>
      {seasonEmojis[season]} {seasonLabels[season]}
    </span>
  );
};
