import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { StockPositionResult, MarketContext } from "@/lib/positionEngine";

export interface PositionSnapshot {
  id: string;
  snapshotDate: string;
  symbol: string;
  name: string;
  stage: string;
  action: string;
  actionPriority: number;
  confidence: number;
  seasonScore: number;
  currentPrice: number;
  costBasis: number;
  pnlPct: number;
  currentPositionValue: number;
  finalTargetValue: number;
  hardStopPct: number | null;
  trailingStopPct: number | null;
  marketRegime: string;
  marketTemperature: number;
  industry: string;
  themeCluster: string;
}

function rowToSnapshot(r: Record<string, unknown>): PositionSnapshot {
  return {
    id: r.id as string,
    snapshotDate: r.snapshot_date as string,
    symbol: r.symbol as string,
    name: r.name as string,
    stage: r.stage as string,
    action: r.action as string,
    actionPriority: Number(r.action_priority),
    confidence: Number(r.confidence),
    seasonScore: Number(r.season_score),
    currentPrice: Number(r.current_price),
    costBasis: Number(r.cost_basis),
    pnlPct: Number(r.pnl_pct),
    currentPositionValue: Number(r.current_position_value),
    finalTargetValue: Number(r.final_target_value),
    hardStopPct: r.hard_stop_pct != null ? Number(r.hard_stop_pct) : null,
    trailingStopPct: r.trailing_stop_pct != null ? Number(r.trailing_stop_pct) : null,
    marketRegime: r.market_regime as string,
    marketTemperature: Number(r.market_temperature),
    industry: (r.industry as string) ?? '',
    themeCluster: (r.theme_cluster as string) ?? '',
  };
}

export function usePositionSnapshots() {
  const { user } = useAuth();

  const saveSnapshot = useCallback(async (
    date: string,
    positions: StockPositionResult[],
    market: MarketContext,
  ): Promise<void> => {
    if (!user || positions.length === 0) return;

    const { data: existing } = await (supabase as any)
      .from("position_snapshots")
      .select("id")
      .eq("snapshot_date", date)
      .limit(1);

    if (existing && existing.length > 0) return;

    const rows = positions.map((pos) => ({
      snapshot_date:          date,
      symbol:                 pos.symbol,
      name:                   pos.name,
      stage:                  pos.stage,
      action:                 pos.action,
      action_priority:        pos.actionPriority,
      confidence:             pos.quantConfidence,
      season_score:           0,
      current_price:          pos.currentPrice,
      cost_basis:             pos.costBasis,
      pnl_pct:                pos.pnlPct,
      current_position_value: pos.currentPositionValue,
      final_target_value:     pos.finalTargetValue,
      hard_stop_pct:          pos.hardStopPct,
      trailing_stop_pct:      pos.trailingStopPct,
      market_regime:          market.regime,
      market_temperature:     market.temperature,
      industry:               pos.industry,
      theme_cluster:          pos.themeCluster,
      user_id:                user.id,
    }));

    await (supabase as any)
      .from("position_snapshots")
      .upsert(rows, { onConflict: "user_id,snapshot_date,symbol", ignoreDuplicates: true });
  }, [user]);

  const getSnapshots = useCallback(async (days = 30): Promise<PositionSnapshot[]> => {
    if (!user) return [];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await (supabase as any)
      .from("position_snapshots")
      .select("*")
      .gte("snapshot_date", sinceStr)
      .order("snapshot_date", { ascending: false })
      .order("symbol", { ascending: true });

    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToSnapshot);
  }, [user]);

  return { saveSnapshot, getSnapshots };
}
