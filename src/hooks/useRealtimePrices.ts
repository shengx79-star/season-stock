import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAShareMarketOpen, getPollInterval } from "@/lib/marketHours";

export interface RealtimeQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: string;
}

const BATCH_SIZE = 50; // Tencent API limit per request

export function useRealtimePrices(symbols: string[]) {
  const [quotes, setQuotes] = useState<Map<string, RealtimeQuote>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketOpen, setMarketOpen] = useState(isAShareMarketOpen());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const symbolsKey = symbols.slice().sort().join(',');

  const fetchQuotes = useCallback(async (syms: string[]) => {
    if (syms.length === 0) return;

    // Split into batches of 50
    const batches: string[][] = [];
    for (let i = 0; i < syms.length; i += BATCH_SIZE) {
      batches.push(syms.slice(i, i + BATCH_SIZE));
    }

    const allResults: RealtimeQuote[] = [];
    for (const batch of batches) {
      try {
        const { data, error } = await supabase.functions.invoke('lookup-stock', {
          body: { symbols: batch },
        });
        if (!error && data?.results) {
          allResults.push(...data.results);
        }
      } catch (_) { /* continue on error */ }
    }

    if (allResults.length > 0) {
      setQuotes(prev => {
        const next = new Map(prev);
        for (const q of allResults) {
          next.set(q.symbol, q);
        }
        return next;
      });
      setLastUpdated(new Date());
    }
  }, []);

  // Refresh market open status and manage polling
  useEffect(() => {
    if (symbols.length === 0) return;

    const startPolling = () => {
      const open = isAShareMarketOpen();
      setMarketOpen(open);

      if (timerRef.current) clearInterval(timerRef.current);

      const interval = getPollInterval();
      if (interval) {
        timerRef.current = setInterval(() => {
          const stillOpen = isAShareMarketOpen();
          setMarketOpen(stillOpen);
          if (stillOpen) {
            fetchQuotes(symbols);
          } else {
            // Market just closed: stop polling
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }, interval);
      }
    };

    // Immediate fetch on mount or symbols change
    fetchQuotes(symbols);
    startPolling();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, fetchQuotes]);

  const refresh = useCallback(() => {
    fetchQuotes(symbols);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, fetchQuotes]);

  return { quotes, lastUpdated, isMarketOpen: marketOpen, refresh };
}
