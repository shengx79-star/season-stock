const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const KLINE_API = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'

function toSecid(symbol: string): string {
  if (/^0[0-9]{4}$/.test(symbol)) return `116.${symbol}`;
  if (symbol.startsWith('6')) return `1.${symbol}`;
  return `0.${symbol}`;
}

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

async function fetchWithRetry(url: string, retries = 3, delayMs = 500): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://finance.eastmoney.com/',
        },
      });
      return resp;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Retry ${i + 1}/${retries} for ${url.slice(0, 80)}...`);
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
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
    
    // Support batch mode: { symbols: ["600309", "01801"], kline_type, num }
    // or single mode: { symbol, kline_type, num }
    const symbols: string[] = body.symbols || (body.symbol ? [body.symbol] : []);
    const kline_type = body.kline_type || 'daily';
    const num = body.num || 120;

    if (symbols.length === 0) {
      return new Response(JSON.stringify({ error: 'symbol or symbols required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const klt = kltFromType(kline_type);
    const results: Record<string, KlineItem[]> = {};

    // Process sequentially with small delay to avoid TLS rejection
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const secid = toSecid(symbol);
      const params = new URLSearchParams({
        secid,
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
        klt,
        fqt: '1',
        end: '20500101',
        lmt: num.toString(),
      });

      try {
        const url = `${KLINE_API}?${params.toString()}`;
        const resp = await fetchWithRetry(url);
        const data = await resp.json();

        if (data.data?.klines && data.data.klines.length > 0) {
          results[symbol] = parseKlines(data.data.klines);
          console.log(`✓ ${symbol} (${secid}): ${results[symbol].length} ${kline_type} bars`);
        } else {
          results[symbol] = [];
          console.log(`✗ ${symbol}: no data`);
        }
      } catch (err) {
        console.error(`✗ ${symbol}: ${err}`);
        results[symbol] = [];
      }

      // Small delay between requests to be polite
      if (i < symbols.length - 1) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Return in batch format if batch request, single format if single
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
