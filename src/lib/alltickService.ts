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

interface CacheEntry {
  dailyBars: Candle[];
  weeklyBars: Candle[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000;

/** Batch fetch via edge function (sequential on server side to avoid TLS errors) */
async function fetchBatch(symbols: string[], kline_type: string, num: number): Promise<Map<string, Candle[]>> {
  const map = new Map<string, Candle[]>();
  if (symbols.length === 0) return map;

  const { data, error } = await supabase.functions.invoke('fetch-kline', {
    body: { symbols, kline_type, num },
  });

  if (error) {
    console.error(`Batch fetch error (${kline_type}):`, error);
    return map;
  }

  const results = data?.results || {};
  for (const [sym, klines] of Object.entries(results)) {
    map.set(sym, (klines as EastMoneyKline[]).map(toCandle));
  }
  return map;
}

/** Single stock fetch (uses batch endpoint with 1 symbol) */
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

export async function fetchSingleKline(
  symbol: string
): Promise<{ dailyBars: Candle[]; weeklyBars: Candle[] }> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { dailyBars: cached.dailyBars, weeklyBars: cached.weeklyBars };
  }

  // Single stock: 2 sequential calls is fine
  const [dailyBars, weeklyBars] = await Promise.all([
    fetchKline(symbol, 'daily', 250),
    fetchKline(symbol, 'weekly', 35),
  ]);

  if (dailyBars.length > 0) {
    cache.set(symbol, { dailyBars, weeklyBars, fetchedAt: Date.now() });
  }

  return { dailyBars, weeklyBars };
}

/**
 * Batch fetch for multiple stocks
 * Uses batch endpoint to avoid parallel TLS connection issues
 */
export async function fetchKlineData(
  symbols: string[]
): Promise<Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>> {
  const result = new Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>();
  const now = Date.now();

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

  // Fetch daily and weekly batches sequentially (each batch is sequential on server)
  const [dailyMap, weeklyMap] = await Promise.all([
    fetchBatch(uncached, 'daily', 250),
    fetchBatch(uncached, 'weekly', 35),
  ]);

  for (const sym of uncached) {
    const dailyBars = dailyMap.get(sym) || [];
    const weeklyBars = weeklyMap.get(sym) || [];
    if (dailyBars.length > 0) {
      cache.set(sym, { dailyBars, weeklyBars, fetchedAt: now });
    }
    result.set(sym, { dailyBars, weeklyBars });
  }

  return result;
}
