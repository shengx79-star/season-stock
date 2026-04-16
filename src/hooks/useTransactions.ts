import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type TransactionType = "buy" | "add" | "reduce" | "exit" | "take_profit" | "force_exit";

export interface Transaction {
  id: string;
  symbol: string;
  name: string;
  type: TransactionType;
  price: number;
  shares: number;
  amount: number;
  txDate: string;
  notes: string;
  createdAt: string;
}

export const TX_LABELS: Record<TransactionType, string> = {
  buy:         "买入",
  add:         "加仓",
  reduce:      "减仓",
  exit:        "清仓",
  take_profit: "止盈",
  force_exit:  "强平",
};

export const TX_COLORS: Record<TransactionType, string> = {
  buy:         "bg-[hsl(var(--spring))] text-white",
  add:         "bg-primary text-primary-foreground",
  reduce:      "bg-[hsl(var(--autumn))] text-white",
  exit:        "bg-[hsl(var(--autumn))] text-white",
  take_profit: "bg-[hsl(var(--summer))] text-white",
  force_exit:  "bg-destructive text-destructive-foreground",
};

function rowToTx(r: Record<string, unknown>): Transaction {
  return {
    id:        r.id as string,
    symbol:    r.symbol as string,
    name:      r.name as string,
    type:      r.type as TransactionType,
    price:     Number(r.price),
    shares:    Number(r.shares),
    amount:    Number(r.amount),
    txDate:    r.tx_date as string,
    notes:     (r.notes as string) ?? "",
    createdAt: r.created_at as string,
  };
}

export function useTransactions() {
  const { user } = useAuth();

  const addTransaction = useCallback(async (
    tx: Omit<Transaction, "id" | "createdAt">
  ): Promise<void> => {
    if (!user) return;
    await (supabase as any).from("transactions").insert({
      user_id: user.id,
      symbol:  tx.symbol,
      name:    tx.name,
      type:    tx.type,
      price:   tx.price,
      shares:  tx.shares,
      amount:  tx.amount,
      tx_date: tx.txDate,
      notes:   tx.notes,
    });
  }, [user]);

  const getBySymbol = useCallback(async (symbol: string): Promise<Transaction[]> => {
    if (!user) return [];
    const { data, error } = await (supabase as any)
      .from("transactions")
      .select("*")
      .eq("symbol", symbol)
      .order("tx_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToTx);
  }, [user]);

  const getAll = useCallback(async (days = 90): Promise<Transaction[]> => {
    if (!user) return [];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    const { data, error } = await (supabase as any)
      .from("transactions")
      .select("*")
      .gte("tx_date", sinceStr)
      .order("tx_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(rowToTx);
  }, [user]);

  const deleteTransaction = useCallback(async (id: string): Promise<void> => {
    await (supabase as any).from("transactions").delete().eq("id", id);
  }, []);

  return { addTransaction, getBySymbol, getAll, deleteTransaction };
}
