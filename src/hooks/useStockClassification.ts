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

export interface ClassificationWithData extends ClassificationResult {
  loading: boolean;
  dailyBars: Candle[];
}

export function useStockClassification(stock: Stock): ClassificationWithData {
  const [realData, setRealData] = useState<{ dailyBars: Candle[]; weeklyBars: Candle[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchSingleKline(stock.symbol)
      .then((data) => {
        if (!cancelled) {
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

  return useMemo(() => {
    const bars = realData || getMockCandles(stock);
    const result = classifyStock({
      dailyBars: bars.dailyBars,
      weeklyBars: bars.weeklyBars,
      currentStage: stock.season,
    });
    return { ...result, loading, dailyBars: bars.dailyBars };
  }, [stock.symbol, stock.season, stock.price, realData, loading]);
}

export interface ClassificationsWithData {
  results: Map<string, ClassificationResult>;
  dailyBarsMap: Map<string, Candle[]>;
  loading: boolean;
}

export function useStockClassifications(stocks: Stock[]): ClassificationsWithData {
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

  const { results, dailyBarsMap } = useMemo(() => {
    const map = new Map<string, ClassificationResult>();
    const barsMap = new Map<string, Candle[]>();
    for (const stock of stocks) {
      const real = realDataMap.get(stock.symbol);
      const bars = (real && real.dailyBars.length >= 20) ? real : getMockCandles(stock);
      map.set(stock.symbol, classifyStock({
        dailyBars: bars.dailyBars,
        weeklyBars: bars.weeklyBars,
        currentStage: stock.season,
      }));
      barsMap.set(stock.symbol, bars.dailyBars);
    }
    return { results: map, dailyBarsMap: barsMap };
  }, [stocks, realDataMap]);

  return { results, dailyBarsMap, loading };
}
