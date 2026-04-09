import { supabase } from "@/integrations/supabase/client";
import { Candle } from "./stockClassifier";

/**
 * AllTick API product code mapping
 * A-shares: 603899.SH (Shanghai), 002140.SZ (Shenzhen)
 * HK stocks: 1801.HK (keep original digits, no leading zero removal)
 */
export function toAllTickCode(symbol: string): string {
  // HK stock patterns from our pool: 00700, 00981, 00992, 01801, 01919, 02331, 03690
  if (/^0[0-9]{4}$/.test(symbol)) {
    // 5-digit HK: remove one leading zero -> 0700.HK, 0981.HK etc
    // Actually AllTick uses: 700.HK (no leading zeros at all)
    return `${parseInt(symbol, 10)}.HK`;
  }
  // A-share Shanghai: starts with 6
  if (symbol.startsWith('6')) {
    return `${symbol}.SH`;
  }
  // A-share Shenzhen: starts with 0 or 3
  if (symbol.startsWith('0') || symbol.startsWith('3')) {
    return `${symbol}.SZ`;
  }
  return symbol;
}

interface AllTickKline {
  timestamp: string;
  open_price: string;
  close_price: string;
  high_price: string;
  low_price: string;
  volume: string;
  turnover: string;
}

function toCandle(k: AllTickKline): Candle {
  const ts = parseInt(k.timestamp, 10);
  const d = new Date(ts * 1000);
  const date = d.toISOString().slice(0, 10);
  return {
    date,
    open: parseFloat(k.open_price),
    close: parseFloat(k.close_price),
    high: parseFloat(k.high_price),
    low: parseFloat(k.low_price),
    volume: parseFloat(k.volume),
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

// Rate limiter: track last request time
let lastRequestTime = 0;
const MIN_INTERVAL = 11000; // 11 seconds for free tier

async function rateLimitedFetch(code: string, kline_type: number, kline_num: number): Promise<AllTickKline[]> {
  // Wait if needed
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();

  const { data, error } = await supabase.functions.invoke('fetch-kline', {
    body: { code, kline_type, kline_num },
  });

  if (error) {
    console.error(`Edge function error for ${code}:`, error);
    return [];
  }

  return data?.klines || [];
}

/**
 * Fetch kline for a single stock (daily + weekly)
 * Uses rate limiting and caching
 */
export async function fetchSingleKline(
  symbol: string
): Promise<{ dailyBars: Candle[]; weeklyBars: Candle[] }> {
  // Check cache
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { dailyBars: cached.dailyBars, weeklyBars: cached.weeklyBars };
  }

  const atCode = toAllTickCode(symbol);

  // Fetch daily (kline_type=8)
  const dailyKlines = await rateLimitedFetch(atCode, 8, 120);
  
  // Fetch weekly (kline_type=9)  
  const weeklyKlines = await rateLimitedFetch(atCode, 9, 35);

  const dailyBars = dailyKlines.map(toCandle).sort((a, b) => a.date.localeCompare(b.date));
  const weeklyBars = weeklyKlines.map(toCandle).sort((a, b) => a.date.localeCompare(b.date));

  // Cache
  cache.set(symbol, { dailyBars, weeklyBars, fetchedAt: Date.now() });

  return { dailyBars, weeklyBars };
}

/**
 * Batch fetch is not practical with free tier rate limits.
 * This fetches nothing - data loads on-demand per stock.
 */
export async function fetchKlineData(
  symbols: string[]
): Promise<Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>> {
  const result = new Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>();

  // Only return cached data for batch requests (list view)
  for (const sym of symbols) {
    const cached = cache.get(sym);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      result.set(sym, { dailyBars: cached.dailyBars, weeklyBars: cached.weeklyBars });
    }
  }

  return result;
}
