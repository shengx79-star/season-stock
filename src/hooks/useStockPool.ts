import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Stock, Season } from "@/lib/stockData";
import { useAuth } from "@/hooks/useAuth";

export function useStockPool() {
  const { user } = useAuth();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

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

  return { stocks, loading, addStock, removeStock, togglePortfolio, refetch: fetchStocks };
}
