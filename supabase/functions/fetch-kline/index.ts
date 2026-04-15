const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isUSStock(symbol: string): boolean {
  return /^[A-Za-z]{1,5}$/.test(symbol);
}

function isJPStock(symbol: string): boolean {
  return /^[0-9]{4}$/.test(symbol);
}

// ─── Tencent Finance (A-share & HK) ───

function toTencentCode(symbol: string): string {
  if (/^0[0-9]{4}$/.test(symbol)) return `hk${symbol}`;
  if (symbol.startsWith('6')) return `sh${symbol}`;
  return `sz${symbol}`;
}

interface KlineItem {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

function parseTencentKlines(data: any, code: string): KlineItem[] {
  if (!data?.data?.[code]) return [];
  const stockData = data.data[code];
  const klines = stockData.qfqday || stockData.day || stockData.priceday || [];
  return klines.map((item: any[]) => ({
    date: item[0],
    open: parseFloat(item[1]),
    close: parseFloat(item[2]),
    high: parseFloat(item[3]),
    low: parseFloat(item[4]),
    volume: parseFloat(item[5] || '0'),
  }));
}

function parseWeeklyKlines(data: any, code: string): KlineItem[] {
  if (!data?.data?.[code]) return [];
  const stockData = data.data[code];
  const klines = stockData.qfqweek || stockData.week || [];
  return klines.map((item: any[]) => ({
    date: item[0],
    open: parseFloat(item[1]),
    close: parseFloat(item[2]),
    high: parseFloat(item[3]),
    low: parseFloat(item[4]),
    volume: parseFloat(item[5] || '0'),
  }));
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://web.ifzq.gtimg.cn/',
        },
      });
      return resp;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Retry ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw new Error('unreachable');
}

async function fetchTencentKline(symbol: string, period: string, num: number): Promise<KlineItem[]> {
  const code = toTencentCode(symbol);
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},${period},,,${num},qfq`;
  const resp = await fetchWithRetry(url);
  const text = await resp.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const match = text.match(/^[^(]*\((.*)\)[^)]*$/s);
    if (match) {
      data = JSON.parse(match[1]);
    } else {
      throw new Error('Failed to parse response');
    }
  }

  return period === 'week'
    ? parseWeeklyKlines(data, code)
    : parseTencentKlines(data, code);
}

// ─── Yahoo Finance (US & JP stocks) ───

async function fetchYahooKline(symbol: string, period: string, num: number, isJP = false): Promise<KlineItem[]> {
  // Map num bars to Yahoo Finance range
  let range: string;
  if (period === 'week') {
    range = num > 52 ? '5y' : '2y';
  } else {
    if (num > 200) range = '2y';
    else if (num > 100) range = '1y';
    else range = '6mo';
  }

  const interval = period === 'week' ? '1wk' : '1d';
  const yahooSymbol = isJP ? `${symbol}.T` : symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });

  if (!resp.ok) {
    console.error(`Yahoo Finance error for ${symbol}: ${resp.status}`);
    return [];
  }

  const json = await resp.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0];
  if (!quotes) return [];

  const klines: KlineItem[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quotes.open?.[i];
    const c = quotes.close?.[i];
    const h = quotes.high?.[i];
    const l = quotes.low?.[i];
    const v = quotes.volume?.[i];
    if (o == null || c == null || h == null || l == null) continue;

    const d = new Date(timestamps[i] * 1000);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    klines.push({
      date: dateStr,
      open: Math.round(o * 100) / 100,
      close: Math.round(c * 100) / 100,
      high: Math.round(h * 100) / 100,
      low: Math.round(l * 100) / 100,
      volume: v || 0,
    });
  }

  // Return only the last `num` bars
  return klines.slice(-num);
}

// ─── Unified fetch ───

async function fetchKlineForSymbol(symbol: string, period: string, num: number): Promise<KlineItem[]> {
  if (isUSStock(symbol)) {
    return fetchYahooKline(symbol, period, num, false);
  }
  if (isJPStock(symbol)) {
    return fetchYahooKline(symbol, period, num, true);
  }
  return fetchTencentKline(symbol, period, num);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const symbols: string[] = body.symbols || (body.symbol ? [body.symbol] : []);
    const kline_type = body.kline_type || 'daily';
    const num = body.num || 120;

    if (symbols.length === 0) {
      return new Response(JSON.stringify({ error: 'symbol or symbols required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const period = kline_type === 'weekly' ? 'week' : 'day';
    const results: Record<string, KlineItem[]> = {};

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        const klines = await fetchKlineForSymbol(symbol, period, num);
        results[symbol] = klines;
        console.log(`✓ ${symbol}: ${klines.length} ${kline_type} bars`);
      } catch (err) {
        console.error(`✗ ${symbol}: ${err}`);
        results[symbol] = [];
      }

      if (i < symbols.length - 1) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    if (body.symbols) {
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      const symbol = symbols[0];
      return new Response(JSON.stringify({ symbol, klines: results[symbol] || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('fetch-kline error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
