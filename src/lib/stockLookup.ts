import { supabase } from "@/integrations/supabase/client";
import { Stock, Season } from "./stockData";

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
    season: "spring" as Season, // Will be determined by classifier
  };
}
