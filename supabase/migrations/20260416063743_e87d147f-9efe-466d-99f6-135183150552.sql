-- Create transactions table
CREATE TABLE public.transactions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL,
    symbol      text NOT NULL,
    name        text NOT NULL DEFAULT '',
    type        text NOT NULL,
    price       numeric NOT NULL,
    shares      numeric NOT NULL,
    amount      numeric NOT NULL,
    tx_date     date NOT NULL DEFAULT current_date,
    notes       text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_symbol ON public.transactions (user_id, symbol);
CREATE INDEX idx_transactions_user_date ON public.transactions (user_id, tx_date DESC);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
ON public.transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
ON public.transactions FOR DELETE USING (auth.uid() = user_id);

-- Add columns to position_snapshots if missing
ALTER TABLE public.position_snapshots
ADD COLUMN IF NOT EXISTS industry      text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS theme_cluster text NOT NULL DEFAULT '';
