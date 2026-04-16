UPDATE public.portfolio_config SET default_quota_pct = 10 WHERE default_quota_pct = 3;
ALTER TABLE public.portfolio_config ALTER COLUMN default_quota_pct SET DEFAULT 10;