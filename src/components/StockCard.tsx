import { Stock } from "@/lib/stockData";
import { SeasonBadge } from "./SeasonBadge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StockCardProps {
  stock: Stock;
  onClick: (stock: Stock) => void;
}

export const StockCard = ({ stock, onClick }: StockCardProps) => {
  const isUp = stock.change >= 0;

  return (
    <div className="stock-card" onClick={() => onClick(stock)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-medium text-foreground">{stock.symbol}</h3>
          <p className="text-sm text-muted-foreground">{stock.name}</p>
        </div>
        <SeasonBadge season={stock.season} size="sm" />
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-medium text-foreground">${stock.price.toFixed(2)}</p>
          <div className={`flex items-center gap-1 mt-1 text-sm font-medium ${isUp ? "text-spring" : "text-destructive"}`}>
            {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{isUp ? "+" : ""}{stock.change.toFixed(2)} ({isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%)</span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground space-y-1">
          <p>市值 {stock.marketCap}</p>
          <p>成交量 {stock.volume}</p>
        </div>
      </div>
    </div>
  );
};
