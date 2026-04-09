const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * East Money (东方财富) free public K-line API
 * No API key needed, supports all A-shares and HK stocks
 */
const KLINE_API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'

// Market codes for East Money: 0=SZ, 1=SH, 116=HK
function toSecid(symbol: string): string {
  // HK stocks: 00700 -> 116.00700, 01801 -> 116.01801
  if (/^0[0-9]{4}$/.test(symbol)) {
    return `116.${symbol}`;
  }
  // Shanghai: starts with 6
  if (symbol.startsWith('6')) {
    return `1.${symbol}`;
  }
  // Shenzhen: starts with 0 or 3
  return `0.${symbol}`;
}

// klt: 101=daily, 102=weekly
function kltFromType(kline_type: string): string {
  return kline_type === 'weekly' ? '102' : '101';
}

interface KlineItem {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

function parseKlines(raw: string[]): KlineItem[] {
  // Each item is "2026-04-01,12.50,12.80,13.00,12.30,1234567,..."
  // Format: date,open,close,high,low,volume,amount,...
  return raw.map((line) => {
    const parts = line.split(',');
    return {
      date: parts[0],
      open: parseFloat(parts[1]),
      close: parseFloat(parts[2]),
      high: parseFloat(parts[3]),
      low: parseFloat(parts[4]),
      volume: parseFloat(parts[5]),
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { symbol, kline_type = 'daily', num = 120 } = await req.json()

    if (!symbol || typeof symbol !== 'string') {
      return new Response(JSON.stringify({ error: 'symbol string required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const secid = toSecid(symbol);
    const klt = kltFromType(kline_type);

    const params = new URLSearchParams({
      secid,
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
      klt,
      fqt: '1', // 前复权
      end: '20500101',
      lmt: num.toString(),
    });

    const url = `${KLINE_API}?${params.toString()}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.data?.klines && data.data.klines.length > 0) {
      const klines = parseKlines(data.data.klines);
      console.log(`✓ ${symbol} (${secid}): ${klines.length} ${kline_type} bars`);
      return new Response(JSON.stringify({ symbol, klines }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.error(`No data for ${symbol} (${secid}):`, JSON.stringify(data).slice(0, 200));
      return new Response(JSON.stringify({ symbol, klines: [], error: 'No data' }), {
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
