import { useMemo } from "react";
import { Stock } from "@/lib/stockData";
import { classifyStock, ClassificationResult } from "@/lib/stockClassifier";
import { generateMockCandles } from "@/lib/mockKlineGenerator";

// Cache generated candles per symbol to keep results stable during session
const candleCache = new Map<string, ReturnType<typeof generateMockCandles>>();

function getCachedCandles(stock: Stock) {
  if (!candleCache.has(stock.symbol)) {
    candleCache.set(stock.symbol, generateMockCandles(stock.price, stock.season));
  }
  return candleCache.get(stock.symbol)!;
}

export function useStockClassification(stock: Stock): ClassificationResult {
  return useMemo(() => {
    const { dailyBars, weeklyBars } = getCachedCandles(stock);
    return classifyStock({ dailyBars, weeklyBars, currentStage: stock.season });
  }, [stock.symbol, stock.season, stock.price]);
}

export function useStockClassifications(stocks: Stock[]): Map<string, ClassificationResult> {
  return useMemo(() => {
    const map = new Map<string, ClassificationResult>();
    for (const stock of stocks) {
      const { dailyBars, weeklyBars } = getCachedCandles(stock);
      map.set(stock.symbol, classifyStock({ dailyBars, weeklyBars, currentStage: stock.season }));
    }
    return map;
  }, [stocks]);
}
