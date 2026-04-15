import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Stock, Season } from "@/lib/stockData";
import { useAuth } from "@/hooks/useAuth";

const REFRESH_COOLDOWN = 5 * 60 * 1000; // 5 min

export function useStockPool() {
  const { user } = useAuth();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefreshRef = useRef<number>(0);

  const fetchStocks = useCallback(async () => {
    if (!user) { setStocks([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("stock_pool")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch stock pool:", error);
      return;
    }

    const mapped: Stock[] = (data || []).map((row: any) => ({
      symbol: row.symbol,
      name: row.name,
      price: Number(row.price),
      change: Number(row.change),
      changePercent: Number(row.change_percent),
      volume: row.volume,
      marketCap: row.market_cap,
      pe: Number(row.pe),
      sector: row.sector,
      season: row.season as Season,
      inPortfolio: !!row.in_portfolio,
    }));

    setStocks(mapped);
    setLoading(false);
  }, [user]);

  /** Batch refresh prices from remote API, then update DB */
  const refreshPrices = useCallback(async () => {
    if (!user || stocks.length === 0) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < REFRESH_COOLDOWN) return;
    lastRefreshRef.current = now;

    setRefreshing(true);
    try {
      const symbols = stocks.map((s) => s.symbol);
      const { data, error } = await supabase.functions.invoke("lookup-stock", {
        body: { action: "batch-quote", symbols },
      });
      if (error || !data?.results) {
        console.error("Batch quote failed:", error);
        return;
      }
      const results = data.results as Record<string, any>;

      // Update each stock in DB
      const updates = Object.entries(results).map(([sym, info]: [string, any]) =>
        supabase
          .from("stock_pool")
          .update({
            price: info.price,
            change: info.change,
            change_percent: info.changePercent,
            volume: info.volume,
            market_cap: info.marketCap,
            pe: info.pe,
          })
          .eq("symbol", sym)
          .eq("user_id", user.id)
      );
      await Promise.all(updates);
      await fetchStocks();
    } catch (e) {
      console.error("refreshPrices error:", e);
    } finally {
      setRefreshing(false);
    }
  }, [user, stocks, fetchStocks]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  // Auto-refresh prices when stocks are loaded
  useEffect(() => {
    if (stocks.length > 0 && !refreshing && Date.now() - lastRefreshRef.current >= REFRESH_COOLDOWN) {
      refreshPrices();
    }
  }, [stocks.length]); // only trigger when stock count changes (initial load)

  const addStock = useCallback(async (stock: Stock): Promise<boolean> => {
    if (!user) return false;
    const { error } = await supabase.from("stock_pool").upsert(
      {
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        change: stock.change,
        change_percent: stock.changePercent,
        volume: stock.volume,
        market_cap: stock.marketCap,
        pe: stock.pe,
        sector: stock.sector,
        season: stock.season,
        user_id: user.id,
      },
      { onConflict: "user_id,symbol" }
    );

    if (error) {
      console.error("Failed to add stock:", error);
      return false;
    }

    await fetchStocks();
    return true;
  }, [fetchStocks, user]);

  const removeStock = useCallback(async (symbol: string): Promise<boolean> => {
    const { error } = await supabase.from("stock_pool").delete().eq("symbol", symbol);
    if (error) {
      console.error("Failed to remove stock:", error);
      return false;
    }
    await fetchStocks();
    return true;
  }, [fetchStocks]);

  const togglePortfolio = useCallback(async (symbol: string, value: boolean): Promise<boolean> => {
    const { error } = await supabase.from("stock_pool").update({ in_portfolio: value }).eq("symbol", symbol);
    if (error) {
      console.error("Failed to toggle in_portfolio:", error);
      return false;
    }
    await fetchStocks();
    return true;
  }, [fetchStocks]);

  return { stocks, loading, refreshing, addStock, removeStock, togglePortfolio, refreshPrices, refetch: fetchStocks };
}
