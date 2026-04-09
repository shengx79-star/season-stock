const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Tencent Finance K-line API (腾讯财经)
 * Format: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=CODE,day,START,END,COUNT,qfq
 * 
 * Code format:
 *   A-share SH: sh600309
 *   A-share SZ: sz002140
 *   HK: hk01801
 */
function toTencentCode(symbol: string): string {
  // HK stocks: 5-digit starting with 0
  if (/^0[0-9]{4}$/.test(symbol)) return `hk${symbol}`;
  // Shanghai: starts with 6
  if (symbol.startsWith('6')) return `sh${symbol}`;
  // Shenzhen: starts with 0 or 3
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
  // Try multiple possible keys: "day", "qfqday", "priceday"
  const klines = stockData.qfqday || stockData.day || stockData.priceday || [];
  
  return klines.map((item: any[]) => {
    // Format: [date, open, close, high, low, volume]
    return {
      date: item[0],
      open: parseFloat(item[1]),
      close: parseFloat(item[2]),
      high: parseFloat(item[3]),
      low: parseFloat(item[4]),
      volume: parseFloat(item[5] || '0'),
    };
  });
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
      const code = toTencentCode(symbol);
      
      try {
        const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},${period},,,,${num},qfq`;
        const resp = await fetchWithRetry(url);
        const text = await resp.text();
        
        // Tencent returns JSONP-like or plain JSON
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          // Try stripping JSONP wrapper
          const match = text.match(/^[^(]*\((.*)\)[^)]*$/s);
          if (match) {
            data = JSON.parse(match[1]);
          } else {
            throw new Error('Failed to parse response');
          }
        }

        const klines = period === 'week' 
          ? parseWeeklyKlines(data, code) 
          : parseTencentKlines(data, code);
        
        results[symbol] = klines;
        console.log(`✓ ${symbol} (${code}): ${klines.length} ${kline_type} bars`);
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
