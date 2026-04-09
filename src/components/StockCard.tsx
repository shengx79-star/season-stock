import { Stock } from "@/lib/stockData";
import { ClassificationResult } from "@/lib/stockClassifier";
import { SeasonBadge } from "./SeasonBadge";
import { SeasonScoreBar } from "./SeasonScoreBar";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Season } from "@/lib/stockData";

interface StockCardProps {
  stock: Stock;
  classification?: ClassificationResult;
  onClick: (stock: Stock) => void;
}

export const StockCard = ({ stock, classification, onClick }: StockCardProps) => {
  const isUp = stock.change >= 0;
  const season = (classification?.stage !== "unknown" ? classification?.stage : stock.season) as Season;
  const confidence = classification?.confidence;
  const confidenceLevel = classification?.confidenceLevel;
  const seasonScore = classification?.seasonScore ?? 50;

  return (
    <div className="stock-card" onClick={() => onClick(stock)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-medium text-foreground">{stock.symbol}</h3>
          <p className="text-sm text-muted-foreground">{stock.name}</p>
        </div>
        <SeasonBadge
          season={season}
          size="sm"
          confidence={confidence}
          confidenceLevel={confidenceLevel}
        />
      </div>

      {/* Season Score Bar */}
      {classification && (
        <div className="mb-3">
          <SeasonScoreBar score={seasonScore} />
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-medium text-foreground">${stock.price.toFixed(2)}</p>
          <div className={`flex items-center gap-1 mt-1 text-sm font-medium ${isUp ? "text-[hsl(var(--spring))]" : "text-destructive"}`}>
            {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{isUp ? "+" : ""}{stock.change.toFixed(2)} ({isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%)</span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground space-y-1">
          <p>市值 {stock.marketCap}</p>
          <p>成交量 {stock.volume}</p>
        </div>
      </div>

      {/* Quick scores */}
      {classification && classification.stage !== "unknown" && (
        <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs text-muted-foreground">
          <span>置信度 <span className={`font-medium ${
            confidenceLevel === "high" ? "text-[hsl(var(--spring))]" :
            confidenceLevel === "medium" ? "text-[hsl(var(--autumn))]" : "text-destructive"
          }`}>{confidence !== undefined ? (confidence * 100).toFixed(0) + "%" : "—"}</span></span>
          <span>温度 <span className="font-medium text-foreground">{seasonScore}</span></span>
          <span>转折 ↑{classification.turnSignals.upTurnCount} ↓{classification.turnSignals.downTurnCount}</span>
        </div>
      )}
    </div>
  );
};
