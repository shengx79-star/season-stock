import { supabase } from "@/integrations/supabase/client";
import { Candle } from "./stockClassifier";

interface EastMoneyKline {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

function toCandle(k: EastMoneyKline): Candle {
  return {
    date: k.date,
    open: k.open,
    close: k.close,
    high: k.high,
    low: k.low,
    volume: k.volume,
  };
}

// In-memory cache with TTL
interface CacheEntry {
  dailyBars: Candle[];
  weeklyBars: Candle[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchKline(symbol: string, kline_type: string, num: number): Promise<Candle[]> {
  const { data, error } = await supabase.functions.invoke('fetch-kline', {
    body: { symbol, kline_type, num },
  });

  if (error) {
    console.error(`Edge function error for ${symbol}:`, error);
    return [];
  }

  const klines: EastMoneyKline[] = data?.klines || [];
  return klines.map(toCandle);
}

/**
 * Fetch daily + weekly kline for a single stock
 */
export async function fetchSingleKline(
  symbol: string
): Promise<{ dailyBars: Candle[]; weeklyBars: Candle[] }> {
  // Check cache
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { dailyBars: cached.dailyBars, weeklyBars: cached.weeklyBars };
  }

  // Fetch daily and weekly in parallel (East Money has no rate limit issues)
  const [dailyBars, weeklyBars] = await Promise.all([
    fetchKline(symbol, 'daily', 120),
    fetchKline(symbol, 'weekly', 35),
  ]);

  // Cache
  if (dailyBars.length > 0) {
    cache.set(symbol, { dailyBars, weeklyBars, fetchedAt: Date.now() });
  }

  return { dailyBars, weeklyBars };
}

/**
 * Batch fetch for multiple stocks (parallel)
 */
export async function fetchKlineData(
  symbols: string[]
): Promise<Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>> {
  const result = new Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>();
  const now = Date.now();

  // Check cache first
  const uncached: string[] = [];
  for (const sym of symbols) {
    const cached = cache.get(sym);
    if (cached && now - cached.fetchedAt < CACHE_TTL) {
      result.set(sym, { dailyBars: cached.dailyBars, weeklyBars: cached.weeklyBars });
    } else {
      uncached.push(sym);
    }
  }

  if (uncached.length === 0) return result;

  // Fetch all uncached in parallel (East Money is free, no rate limit)
  const promises = uncached.map(async (sym) => {
    const [dailyBars, weeklyBars] = await Promise.all([
      fetchKline(sym, 'daily', 120),
      fetchKline(sym, 'weekly', 35),
    ]);
    return { sym, dailyBars, weeklyBars };
  });

  const results = await Promise.all(promises);
  for (const { sym, dailyBars, weeklyBars } of results) {
    if (dailyBars.length > 0) {
      cache.set(sym, { dailyBars, weeklyBars, fetchedAt: now });
    }
    result.set(sym, { dailyBars, weeklyBars });
  }

  return result;
}
