import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { LiquidityLevel, PositionInput } from "@/lib/positionEngine";

export interface PortfolioConfig {
  id: string;
  totalAssets: number;
  defaultQuotaPct: number;
}

export interface PositionRecord {
  id: string;
  symbol: string;
  positionValue: number;
  costBasis: number;
  shares: number;
  quotaValue: number | null;
  highestCloseSinceEntry: number;
  industry: string;
  themeCluster: string;
  liquidityLevel: LiquidityLevel;
}

export function usePortfolio() {
  const { user } = useAuth();
  const [config, setConfig] = useState<PortfolioConfig | null>(null);
  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("portfolio_config")
      .select("*")
      .limit(1)
      .single();
    if (data) {
      setConfig({
        id: data.id,
        totalAssets: Number(data.total_assets),
        defaultQuotaPct: Number(data.default_quota_pct),
      });
    }
  }, [user]);

  const fetchPositions = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("positions")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) {
      setPositions(data.map((r: any) => ({
        id: r.id,
        symbol: r.symbol,
        positionValue: Number(r.position_value),
        costBasis: Number(r.cost_basis),
        shares: Number(r.shares),
        quotaValue: r.quota_value ? Number(r.quota_value) : null,
        highestCloseSinceEntry: Number(r.highest_close_since_entry),
        industry: r.industry,
        themeCluster: r.theme_cluster,
        liquidityLevel: r.liquidity_level as LiquidityLevel,
      })));
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    Promise.all([fetchConfig(), fetchPositions()]).then(() => setLoading(false));
  }, [fetchConfig, fetchPositions, user]);

  const updateConfig = useCallback(async (totalAssets: number, defaultQuotaPct: number) => {
    if (!config) return;
    await supabase
      .from("portfolio_config")
      .update({ total_assets: totalAssets, default_quota_pct: defaultQuotaPct })
      .eq("id", config.id);
    setConfig({ ...config, totalAssets, defaultQuotaPct });
  }, [config]);

  const upsertPosition = useCallback(async (pos: Omit<PositionRecord, "id">) => {
    if (!user) return;
    await supabase.from("positions").upsert({
      symbol: pos.symbol,
      position_value: pos.positionValue,
      cost_basis: pos.costBasis,
      shares: pos.shares,
      quota_value: pos.quotaValue,
      highest_close_since_entry: pos.highestCloseSinceEntry,
      industry: pos.industry,
      theme_cluster: pos.themeCluster,
      liquidity_level: pos.liquidityLevel,
      user_id: user.id,
    }, { onConflict: "user_id,symbol" });
    await fetchPositions();
  }, [fetchPositions, user]);

  const removePosition = useCallback(async (symbol: string) => {
    await supabase.from("positions").delete().eq("symbol", symbol);
    await fetchPositions();
  }, [fetchPositions]);

  return { config, positions, loading, updateConfig, upsertPosition, removePosition, refetch: () => Promise.all([fetchConfig(), fetchPositions()]) };
}
