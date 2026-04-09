interface SeasonScoreBarProps {
  score: number; // 0-100
}

export const SeasonScoreBar = ({ score }: SeasonScoreBarProps) => {
  // 温度色：冬=蓝, 春=绿, 夏=红, 秋=橙
  const getColor = (s: number) => {
    if (s <= 25) return "bg-[hsl(var(--winter))]";
    if (s <= 50) return "bg-[hsl(var(--spring))]";
    if (s <= 70) return "bg-[hsl(var(--autumn))]";
    return "bg-[hsl(var(--summer))]";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor(score)}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground font-medium w-8 text-right">{score}</span>
    </div>
  );
};
