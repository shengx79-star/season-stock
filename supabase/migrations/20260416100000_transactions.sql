create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  name        text not null default '',
  type        text not null,   -- buy | add | reduce | exit | take_profit | force_exit
  price       numeric not null,
  shares      numeric not null,
  amount      numeric not null, -- price × shares
  tx_date     date not null default current_date,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

create index on public.transactions (user_id, symbol);
create index on public.transactions (user_id, tx_date desc);

alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on public.transactions for select using (auth.uid() = user_id);
create policy "Users can insert own transactions"
  on public.transactions for insert with check (auth.uid() = user_id);
create policy "Users can delete own transactions"
  on public.transactions for delete using (auth.uid() = user_id);
