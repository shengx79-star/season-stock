import { supabase } from "@/integrations/supabase/client";
import { Candle } from "./stockClassifier";

/**
 * AllTick API product code mapping
 * A-shares: 603899.SH (Shanghai), 002140.SZ (Shenzhen)
 * HK stocks: 700.HK (remove leading zeros)
 */
export function toAllTickCode(symbol: string): string {
  // HK stock: starts with 0 and length <= 5, or is known HK format
  if (/^0\d{3,4}$/.test(symbol)) {
    // Remove leading zeros: 00700 -> 700, 00981 -> 981, 00992 -> 992
    const hkCode = symbol.replace(/^0+/, '');
    return `${hkCode}.HK`;
  }
  if (/^[1-9]\d{3,4}$/.test(symbol) && !symbol.startsWith('6') && !symbol.startsWith('0') && !symbol.startsWith('3')) {
    // Likely HK stock like 1801, 1919, 2331, 3690
    return `${symbol}.HK`;
  }
  // A-share Shanghai: starts with 6
  if (symbol.startsWith('6')) {
    return `${symbol}.SH`;
  }
  // A-share Shenzhen: starts with 0 or 3
  if (symbol.startsWith('0') || symbol.startsWith('3')) {
    return `${symbol}.SZ`;
  }
  // Fallback
  return symbol;
}

// Determine market from original symbol
function isHKStock(symbol: string): boolean {
  // Known HK patterns from the stock pool
  return /^0[0-9]{3,4}$/.test(symbol) || 
         ['01801', '01919', '02331', '03690'].includes(symbol);
}

export function toAllTickCodeSmart(symbol: string): string {
  if (isHKStock(symbol)) {
    const hkCode = symbol.replace(/^0+/, '');
    return `${hkCode}.HK`;
  }
  if (symbol.startsWith('6')) return `${symbol}.SH`;
  return `${symbol}.SZ`;
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
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchKlineData(
  symbols: string[]
): Promise<Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>> {
  const result = new Map<string, { dailyBars: Candle[]; weeklyBars: Candle[] }>();
  const now = Date.now();

  // Check cache first
  const uncachedSymbols: string[] = [];
  for (const sym of symbols) {
    const cached = cache.get(sym);
    if (cached && now - cached.fetchedAt < CACHE_TTL) {
      result.set(sym, { dailyBars: cached.dailyBars, weeklyBars: cached.weeklyBars });
    } else {
      uncachedSymbols.push(sym);
    }
  }

  if (uncachedSymbols.length === 0) return result;

  // Convert to AllTick codes
  const allTickCodes = uncachedSymbols.map(toAllTickCodeSmart);

  // Fetch daily data (kline_type=8, 120 bars)
  const dailyResp = await supabase.functions.invoke('fetch-kline', {
    body: { symbols: allTickCodes, kline_type: 8, kline_num: 120 },
  });

  // Fetch weekly data (kline_type=9, 35 bars)
  const weeklyResp = await supabase.functions.invoke('fetch-kline', {
    body: { symbols: allTickCodes, kline_type: 9, kline_num: 35 },
  });

  const dailyData = dailyResp.data?.data || {};
  const weeklyData = weeklyResp.data?.data || {};

  for (let i = 0; i < uncachedSymbols.length; i++) {
    const sym = uncachedSymbols[i];
    const atCode = allTickCodes[i];

    const dailyKlines: AllTickKline[] = dailyData[atCode]?.klines || [];
    const weeklyKlines: AllTickKline[] = weeklyData[atCode]?.klines || [];

    const dailyBars = dailyKlines.map(toCandle).sort((a, b) => a.date.localeCompare(b.date));
    const weeklyBars = weeklyKlines.map(toCandle).sort((a, b) => a.date.localeCompare(b.date));

    // Cache the result
    cache.set(sym, { dailyBars, weeklyBars, fetchedAt: now });
    result.set(sym, { dailyBars, weeklyBars });
  }

  return result;
}

/**
 * Fetch kline for a single stock
 */
export async function fetchSingleKline(
  symbol: string
): Promise<{ dailyBars: Candle[]; weeklyBars: Candle[] }> {
  const map = await fetchKlineData([symbol]);
  return map.get(symbol) || { dailyBars: [], weeklyBars: [] };
}
