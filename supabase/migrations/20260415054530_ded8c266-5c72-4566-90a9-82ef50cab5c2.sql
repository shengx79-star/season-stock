
-- 1. Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  -- Also create a default portfolio_config row for the new user
  INSERT INTO public.portfolio_config (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Add user_id to stock_pool
ALTER TABLE public.stock_pool ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old policies
DROP POLICY IF EXISTS "Anyone can add stocks" ON public.stock_pool;
DROP POLICY IF EXISTS "Anyone can delete stocks" ON public.stock_pool;
DROP POLICY IF EXISTS "Anyone can update stocks" ON public.stock_pool;
DROP POLICY IF EXISTS "Anyone can view stocks" ON public.stock_pool;

-- New per-user policies
CREATE POLICY "Users can view own stocks" ON public.stock_pool FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stocks" ON public.stock_pool FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stocks" ON public.stock_pool FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own stocks" ON public.stock_pool FOR DELETE USING (auth.uid() = user_id);

-- 3. Add user_id to positions
ALTER TABLE public.positions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Anyone can delete positions" ON public.positions;
DROP POLICY IF EXISTS "Anyone can insert positions" ON public.positions;
DROP POLICY IF EXISTS "Anyone can update positions" ON public.positions;
DROP POLICY IF EXISTS "Anyone can view positions" ON public.positions;

CREATE POLICY "Users can view own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own positions" ON public.positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own positions" ON public.positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own positions" ON public.positions FOR DELETE USING (auth.uid() = user_id);

-- 4. Add user_id to portfolio_config
ALTER TABLE public.portfolio_config ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Anyone can delete portfolio config" ON public.portfolio_config;
DROP POLICY IF EXISTS "Anyone can insert portfolio config" ON public.portfolio_config;
DROP POLICY IF EXISTS "Anyone can update portfolio config" ON public.portfolio_config;
DROP POLICY IF EXISTS "Anyone can view portfolio config" ON public.portfolio_config;

CREATE POLICY "Users can view own config" ON public.portfolio_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own config" ON public.portfolio_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own config" ON public.portfolio_config FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own config" ON public.portfolio_config FOR DELETE USING (auth.uid() = user_id);

-- 5. Add user_id to position_snapshots
ALTER TABLE public.position_snapshots ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "public_all" ON public.position_snapshots;

CREATE POLICY "Users can view own snapshots" ON public.position_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own snapshots" ON public.position_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own snapshots" ON public.position_snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own snapshots" ON public.position_snapshots FOR DELETE USING (auth.uid() = user_id);

-- 6. Drop the unique constraint on stock_pool symbol (now per-user)
ALTER TABLE public.stock_pool DROP CONSTRAINT IF EXISTS stock_pool_symbol_key;
CREATE UNIQUE INDEX stock_pool_user_symbol ON public.stock_pool (user_id, symbol);

-- 7. Drop the unique constraint on positions symbol (now per-user)
ALTER TABLE public.positions DROP CONSTRAINT IF EXISTS positions_symbol_key;
CREATE UNIQUE INDEX positions_user_symbol ON public.positions (user_id, symbol);

-- 8. Update position_snapshots unique constraint
ALTER TABLE public.position_snapshots DROP CONSTRAINT IF EXISTS position_snapshots_snapshot_date_symbol_key;
CREATE UNIQUE INDEX position_snapshots_user_date_symbol ON public.position_snapshots (user_id, snapshot_date, symbol);
