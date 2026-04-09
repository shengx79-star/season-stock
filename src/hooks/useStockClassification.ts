import { useState, useEffect, useMemo } from "react";
import { Stock } from "@/lib/stockData";
import { classifyStock, ClassificationResult, Candle } from "@/lib/stockClassifier";
import { generateMockCandles } from "@/lib/mockKlineGenerator";
import { fetchKlineData, fetchSingleKline } from "@/lib/alltickService";

// Mock data fallback cache
const mockCache = new Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>();

function getMockCandles(stock: Stock) {
  if (!mockCache.has(stock.symbol)) {
    mockCache.set(stock.symbol, generateMockCandles(stock.price, stock.season));
  }
  return mockCache.get(stock.symbol)!;
}

export function useStockClassification(stock: Stock): ClassificationResult & { loading: boolean } {
  const [realData, setRealData] = useState<{ dailyBars: Candle[]; weeklyBars: Candle[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchSingleKline(stock.symbol)
      .then((data) => {
        if (!cancelled) {
          // Only use real data if we got meaningful results
          if (data.dailyBars.length >= 20) {
            setRealData(data);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [stock.symbol]);

  const result = useMemo(() => {
    const bars = realData || getMockCandles(stock);
    return classifyStock({
      dailyBars: bars.dailyBars,
      weeklyBars: bars.weeklyBars,
      currentStage: stock.season,
    });
  }, [stock.symbol, stock.season, stock.price, realData]);

  return { ...result, loading };
}

export function useStockClassifications(stocks: Stock[]): {
  results: Map<string, ClassificationResult>;
  loading: boolean;
} {
  const [realDataMap, setRealDataMap] = useState<Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>>(new Map());
  const [loading, setLoading] = useState(true);

  const symbols = useMemo(() => stocks.map(s => s.symbol), [stocks]);

  useEffect(() => {
    if (stocks.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchKlineData(symbols)
      .then((dataMap) => {
        if (!cancelled) {
          setRealDataMap(dataMap);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [symbols.join(',')]);

  const results = useMemo(() => {
    const map = new Map<string, ClassificationResult>();
    for (const stock of stocks) {
      const real = realDataMap.get(stock.symbol);
      const bars = (real && real.dailyBars.length >= 20) ? real : getMockCandles(stock);
      map.set(stock.symbol, classifyStock({
        dailyBars: bars.dailyBars,
        weeklyBars: bars.weeklyBars,
        currentStage: stock.season,
      }));
    }
    return map;
  }, [stocks, realDataMap]);

  return { results, loading };
}
