import { Stock, Season, seasonLabels, seasonEmojis, seasonDescriptions, getStocksBySeason } from "@/lib/stockData";
import { ClassificationResult } from "@/lib/stockClassifier";
import { KanbanCard } from "./KanbanCard";

interface KanbanBoardProps {
  classifications: Map<string, ClassificationResult>;
  onStockClick: (stock: Stock) => void;
}

const columns: { season: Season; gradient: string }[] = [
  { season: "winter", gradient: "from-[hsl(var(--winter))] to-[hsl(217,70%,60%)]" },
  { season: "spring", gradient: "from-[hsl(var(--spring))] to-[hsl(142,60%,55%)]" },
  { season: "summer", gradient: "from-[hsl(38,92%,55%)] to-[hsl(25,95%,55%)]" },
  { season: "autumn", gradient: "from-[hsl(var(--autumn))] to-[hsl(20,85%,50%)]" },
];

const seasonSubtitles: Record<Season, string> = {
  winter: "大幅下跌 · 建底仓",
  spring: "趋势向上 · 逐步加仓",
  summer: "上涨确认 · 持有加仓",
  autumn: "高位横盘 · 逐步减仓",
};

export const KanbanBoard = ({ classifications, onStockClick }: KanbanBoardProps) => {
  return (
    <div className="grid grid-cols-4 gap-4 h-full">
      {columns.map(({ season, gradient }) => {
        const stocks = getStocksBySeason(season);
        return (
          <div key={season} className="flex flex-col min-h-0">
            {/* Column header */}
            <div className={`rounded-xl bg-gradient-to-r ${gradient} px-4 py-3 mb-3 flex items-center justify-between`}>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">{seasonEmojis[season]}</span>
                  <span className="text-white font-bold text-base">{seasonLabels[season]}</span>
                </div>
                <p className="text-white/80 text-xs mt-0.5">{seasonSubtitles[season]}</p>
              </div>
              <span className="bg-white/25 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {stocks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
              {stocks.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  拖入股票到此处
                </div>
              ) : (
                stocks.map((stock) => (
                  <KanbanCard
                    key={stock.symbol}
                    stock={stock}
                    classification={classifications.get(stock.symbol)}
                    onClick={onStockClick}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
