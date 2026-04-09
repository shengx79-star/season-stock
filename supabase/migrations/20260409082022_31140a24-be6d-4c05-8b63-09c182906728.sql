
CREATE TABLE public.stock_pool (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  change NUMERIC NOT NULL DEFAULT 0,
  change_percent NUMERIC NOT NULL DEFAULT 0,
  volume TEXT NOT NULL DEFAULT '0',
  market_cap TEXT NOT NULL DEFAULT '0',
  pe NUMERIC NOT NULL DEFAULT 0,
  sector TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL DEFAULT 'spring',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stocks" ON public.stock_pool FOR SELECT USING (true);
CREATE POLICY "Anyone can add stocks" ON public.stock_pool FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update stocks" ON public.stock_pool FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete stocks" ON public.stock_pool FOR DELETE USING (true);

-- Seed with existing stock pool
INSERT INTO public.stock_pool (symbol, name, price, change, change_percent, volume, market_cap, pe, sector, season) VALUES
  ('002140', '东华科技', 12.49, -0.16, -1.3, '8.3M', '52亿', 25.1, '化工', 'summer'),
  ('600309', '万华化学', 87.59, 1.12, 1.3, '18.9M', '2750亿', 15.6, '化工', 'summer'),
  ('00981', '中芯国际', 56.10, -0.06, -0.1, '5.8M', '4420亿', 120.5, '半导体', 'summer'),
  ('01801', '信达生物', 88.00, -1.34, -1.5, '3.2M', '1320亿', -45.2, '生物医药', 'summer'),
  ('601985', '中国核电', 8.70, -0.08, -0.9, '42.5M', '1630亿', 18.5, '电力', 'summer'),
  ('000338', '潍柴动力', 25.98, 0.58, 2.3, '25.3M', '2230亿', 14.8, '机械', 'summer'),
  ('600938', '中国海油', 38.31, 0.93, 2.5, '45.6M', '18200亿', 8.5, '石油', 'summer'),
  ('00700', '腾讯控股', 511.50, 3.55, 0.7, '8.2M', '48900亿', 22.8, '互联网', 'summer'),
  ('00992', '联想集团', 9.91, -0.21, -2.1, '18.5M', '1190亿', 15.2, '科技', 'summer'),
  ('603899', '晨光股份', 25.73, -0.10, -0.4, '12.5M', '238亿', 18.2, '文具', 'spring'),
  ('000599', '青岛双星', 5.37, -0.15, -2.7, '15.6M', '68亿', -8.5, '轮胎', 'spring'),
  ('600089', '特变电工', 26.73, -0.19, -0.7, '22.4M', '998亿', 10.3, '电力设备', 'spring'),
  ('002408', '齐翔腾达', 6.90, 0.32, 4.9, '35.2M', '92亿', 28.6, '化工', 'spring'),
  ('600900', '长江电力', 26.39, -0.19, -0.7, '15.8M', '6080亿', 20.5, '电力', 'spring'),
  ('601899', '紫金矿业', 33.90, -0.73, -2.1, '85.2M', '890亿', 12.8, '矿业', 'autumn'),
  ('002714', '牧原股份', 43.80, -0.53, -1.2, '28.7M', '2280亿', -15.8, '养殖', 'autumn'),
  ('03690', '美团-W', 88.95, 0.44, 0.5, '12.8M', '5520亿', -32.1, '互联网', 'autumn'),
  ('601919', '中远海控', 15.20, 0.00, 0.0, '32.1M', '1520亿', 5.2, '航运', 'winter'),
  ('600691', '阳化科技', 3.34, 0.04, 1.2, '6.2M', '18亿', -12.3, '科技', 'winter'),
  ('02331', '李宁', 22.64, 0.78, 3.6, '9.8M', '580亿', 22.3, '运动服饰', 'winter'),
  ('01919', '中远海控', 15.28, 0.00, 0.0, '6.1M', '1520亿', 5.2, '航运', 'winter');
