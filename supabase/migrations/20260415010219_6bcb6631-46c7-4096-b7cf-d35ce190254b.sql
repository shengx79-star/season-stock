CREATE TABLE IF NOT EXISTS public.position_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  stage text NOT NULL,
  action text NOT NULL,
  action_priority int NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  season_score numeric NOT NULL DEFAULT 0,
  current_price numeric NOT NULL DEFAULT 0,
  cost_basis numeric NOT NULL DEFAULT 0,
  pnl_pct numeric NOT NULL DEFAULT 0,
  current_position_value numeric NOT NULL DEFAULT 0,
  final_target_value numeric NOT NULL DEFAULT 0,
  hard_stop_pct numeric,
  trailing_stop_pct numeric,
  market_regime text NOT NULL DEFAULT 'mild',
  market_temperature numeric NOT NULL DEFAULT 50,
  created_at timestamptz DEFAULT now(),
  UNIQUE(snapshot_date, symbol)
);

ALTER TABLE public.position_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON public.position_snapshots
FOR ALL USING (true) WITH CHECK (true);