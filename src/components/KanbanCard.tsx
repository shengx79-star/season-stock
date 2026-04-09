import { Stock, Season } from "@/lib/stockData";
import { ClassificationResult } from "@/lib/stockClassifier";

interface KanbanCardProps {
  stock: Stock;
  classification?: ClassificationResult;
  onClick: (stock: Stock) => void;
}

export const KanbanCard = ({ stock, classification, onClick }: KanbanCardProps) => {
  const isUp = stock.change > 0;
  const isDown = stock.change < 0;
  const season = (classification?.stage !== "unknown" ? classification?.stage : stock.season) as Season;
  const seasonScore = classification?.seasonScore ?? null;
  const scoreChange = classification ? Math.round((classification.confidence ?? 0) * 10 - 5) : null;

  // Build MA alignment string from classification indicators
  const maText = classification?.indicators
    ? buildMaText(classification.indicators.maAlignmentScore)
    : null;

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onClick(stock)}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-foreground">{stock.symbol}</span>
        <span className="text-sm text-muted-foreground">{stock.name}</span>
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-sm font-medium ${isUp ? "text-[hsl(var(--summer))]" : isDown ? "text-[hsl(var(--spring))]" : "text-muted-foreground"}`}>
          {stock.price.toFixed(2)}
        </span>
        <span className={`text-xs ${isUp ? "text-[hsl(var(--summer))]" : isDown ? "text-[hsl(var(--spring))]" : "text-muted-foreground"}`}>
          {isUp ? "↑" : isDown ? "↓" : ""}{isUp ? "+" : ""}{stock.changePercent.toFixed(1)}%
        </span>
      </div>

      {maText && (
        <p className="text-xs text-muted-foreground mt-1.5 truncate">{maText}</p>
      )}

      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
        {seasonScore !== null ? (
          <>
            {scoreChange !== null && scoreChange !== 0 && (
              <span className={scoreChange > 0 ? "text-[hsl(var(--summer))]" : "text-[hsl(var(--spring))]"}>
                {scoreChange > 0 ? "↑" : "↓"}
              </span>
            )}
            <span>{seasonScore}分</span>
            {scoreChange !== null && scoreChange !== 0 && (
              <span className={scoreChange > 0 ? "text-[hsl(var(--summer))]" : "text-[hsl(var(--spring))]"}>
                {scoreChange > 0 ? "+" : ""}{scoreChange}
              </span>
            )}
          </>
        ) : (
          <span>— {seasonScore ?? 40}分</span>
        )}
      </div>
    </div>
  );
};

function buildMaText(alignmentScore: number): string {
  // Approximate MA ordering from alignment score
  switch (alignmentScore) {
    case 3: return "MA5 > MA10 > MA14 > MA20 > M...";
    case 2: return "MA5 > MA10 > MA14 < MA20 > M...";
    case 1: return "MA5 < MA10 < MA14 > MA20 > M...";
    case 0: return "MA5 < MA10 < MA14 < MA20 < M...";
    default: return "MA5 < MA10 < MA14 < MA20 < M...";
  }
}
