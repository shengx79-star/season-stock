create table if not exists position_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  snapshot_date          date not null,
  symbol                 text not null,
  name                   text not null,
  stage                  text not null,
  action                 text not null,
  action_priority        int  not null default 0,
  confidence             numeric not null default 0,
  season_score           numeric not null default 0,
  current_price          numeric not null default 0,
  cost_basis             numeric not null default 0,
  pnl_pct                numeric not null default 0,
  current_position_value numeric not null default 0,
  final_target_value     numeric not null default 0,
  hard_stop_pct          numeric,
  trailing_stop_pct      numeric,
  market_regime          text not null default 'mild',
  market_temperature     numeric not null default 50,
  created_at             timestamptz default now(),
  unique(snapshot_date, symbol)
);

alter table position_snapshots enable row level security;

create policy "public_all" on position_snapshots
  for all using (true) with check (true);
