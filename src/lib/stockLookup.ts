import { supabase } from "@/integrations/supabase/client";
import { Stock, Season } from "./stockData";

export interface StockSuggestion {
  market: string;
  symbol: string;
  name: string;
}

/** Search stocks by name keyword, returns suggestions */
export async function searchStockByName(keyword: string): Promise<StockSuggestion[]> {
  const { data, error } = await supabase.functions.invoke("lookup-stock", {
    body: { action: "search", keyword },
  });
  if (error || !data || !data.suggestions) {
    console.error("Stock search failed:", error || data?.error);
    return [];
  }
  return data.suggestions;
}

/** Lookup a stock by symbol code and return full info */
export async function lookupStock(symbol: string): Promise<Stock | null> {
  const { data, error } = await supabase.functions.invoke("lookup-stock", {
    body: { symbol },
  });

  if (error || !data || data.error) {
    console.error("Stock lookup failed:", error || data?.error);
    return null;
  }

  return {
    symbol: data.symbol,
    name: data.name,
    price: data.price,
    change: data.change,
    changePercent: data.changePercent,
    volume: data.volume,
    marketCap: data.marketCap,
    pe: data.pe,
    sector: data.sector || "",
    season: "spring" as Season,
  };
}
