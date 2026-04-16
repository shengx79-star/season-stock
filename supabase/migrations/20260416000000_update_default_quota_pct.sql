-- Change default quota percentage from 3% to 10%
ALTER TABLE public.portfolio_config
  ALTER COLUMN default_quota_pct SET DEFAULT 10;

-- Update existing rows that still have the old default of 3
UPDATE public.portfolio_config
  SET default_quota_pct = 10
  WHERE default_quota_pct = 3;
