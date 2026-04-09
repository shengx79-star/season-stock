import { Stock } from "@/lib/stockData";
import { ClassificationResult, Candle } from "@/lib/stockClassifier";
import { SeasonBadge } from "./SeasonBadge";
import { SeasonScoreBar } from "./SeasonScoreBar";
import { MiniKlineChart } from "./MiniKlineChart";
import { TrendingUp, TrendingDown, X, Briefcase } from "lucide-react";
import { Season } from "@/lib/stockData";

interface StockCardProps {
  stock: Stock;
  classification?: ClassificationResult;
  dailyBars?: Candle[];
  onClick: (stock: Stock) => void;
  onDelete?: (symbol: string) => void;
  onTogglePortfolio?: (symbol: string, value: boolean) => void;
}

export const StockCard = ({ stock, classification, dailyBars, onClick, onDelete, onTogglePortfolio }: StockCardProps) => {
  const isUp = stock.change >= 0;
  const season = (classification?.stage !== "unknown" ? classification?.stage : stock.season) as Season;
  const confidence = classification?.confidence;
  const confidenceLevel = classification?.confidenceLevel;
  const seasonScore = classification?.seasonScore ?? 50;
  const inPortfolio = !!stock.inPortfolio;

  return (
    <div className="stock-card relative group" onClick={() => onClick(stock)}>
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onTogglePortfolio && (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePortfolio(stock.symbol, !inPortfolio); }}
            className={`p-1 rounded-full transition-colors ${inPortfolio ? "bg-primary/20 text-primary" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"}`}
            title={inPortfolio ? "移出仓位管理" : "纳入仓位管理"}
          >
            <Briefcase className="w-3.5 h-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(stock.symbol); }}
            className="p-1 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive"
            title="删除"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {inPortfolio && (
        <div className="absolute top-2 left-2 z-10">
          <Briefcase className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
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

      {dailyBars && dailyBars.length > 2 && (
        <MiniKlineChart dailyBars={dailyBars} season={season} bars={30} height={48} className="mb-2 -mx-1" />
      )}

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
