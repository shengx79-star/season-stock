
-- Portfolio configuration (single row for now, no auth)
CREATE TABLE public.portfolio_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_assets numeric NOT NULL DEFAULT 1000000,
  default_quota_pct numeric NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portfolio config" ON public.portfolio_config FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portfolio config" ON public.portfolio_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portfolio config" ON public.portfolio_config FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete portfolio config" ON public.portfolio_config FOR DELETE USING (true);

-- Insert default row
INSERT INTO public.portfolio_config (total_assets, default_quota_pct) VALUES (1000000, 3);

-- Positions table for per-stock holdings
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL UNIQUE,
  position_value numeric NOT NULL DEFAULT 0,
  cost_basis numeric NOT NULL DEFAULT 0,
  shares numeric NOT NULL DEFAULT 0,
  quota_value numeric,
  highest_close_since_entry numeric NOT NULL DEFAULT 0,
  industry text NOT NULL DEFAULT '',
  theme_cluster text NOT NULL DEFAULT '',
  liquidity_level text NOT NULL DEFAULT 'good',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view positions" ON public.positions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert positions" ON public.positions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update positions" ON public.positions FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete positions" ON public.positions FOR DELETE USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_portfolio_config_updated_at
  BEFORE UPDATE ON public.portfolio_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
