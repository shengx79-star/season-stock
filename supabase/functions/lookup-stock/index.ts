const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function toTencentCode(symbol: string): string {
  if (/^0[0-9]{4}$/.test(symbol)) return `hk${symbol}`;
  if (symbol.startsWith('6')) return `sh${symbol}`;
  return `sz${symbol}`;
}

function detectMarket(symbol: string): string {
  if (/^0[0-9]{4}$/.test(symbol)) return 'HK';
  if (symbol.startsWith('6')) return 'SH';
  return 'SZ';
}

async function fetchQuote(symbol: string) {
  const code = toTencentCode(symbol);
  const url = `https://qt.gtimg.cn/q=${code}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://finance.qq.com/',
    },
  });
  const text = await resp.text();
  const match = text.match(/"([^"]*)"/);
  if (!match || !match[1] || match[1].length < 10) return null;

  const fields = match[1].split('~');
  const name = fields[1] || '';
  const price = parseFloat(fields[3]) || 0;
  const prevClose = parseFloat(fields[4]) || 0;
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? ((change / prevClose) * 100) : 0;
  const volume = parseFloat(fields[6]) || 0;
  const totalValue = parseFloat(fields[45]) || 0;
  const pe = parseFloat(fields[39]) || 0;

  let volumeStr: string;
  if (volume >= 10000) {
    volumeStr = `${(volume / 10000).toFixed(1)}万手`;
  } else {
    volumeStr = `${volume.toFixed(0)}手`;
  }

  let marketCapStr: string;
  if (totalValue >= 10000) {
    marketCapStr = `${(totalValue / 10000).toFixed(0)}亿`;
  } else {
    marketCapStr = `${totalValue.toFixed(0)}万`;
  }

  const market = detectMarket(symbol);

  return {
    symbol,
    name,
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    volume: volumeStr,
    marketCap: marketCapStr,
    pe: Math.round(pe * 10) / 10,
    sector: '',
    market,
  };
}

async function searchByName(keyword: string) {
  // Use Tencent smartbox suggest API
  const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(keyword)}&t=all`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://finance.qq.com/',
    },
  });
  const text = await resp.text();
  // Format: v_hint="sz~000001~平安银行~GP~...^sh~600519~贵州茅台~GP~..."
  const match = text.match(/"([^"]*)"/);
  if (!match || !match[1]) return [];

  const items = match[1].split('^').filter(Boolean);
  const results: Array<{ market: string; symbol: string; name: string; type: string }> = [];

  for (const item of items) {
    const parts = item.split('~');
    if (parts.length < 4) continue;
    const mkt = parts[0]; // sh, sz, hk
    const code = parts[1];
    const name = parts[2];
    const type = parts[3]; // GP=股票, GP-A, ZS=指数, JJ=基金, etc.
    // Only include stocks (GP or GP-A/GP-B)
    if (!type.toUpperCase().startsWith('GP')) continue;
    results.push({ market: mkt, symbol: code, name });
  }

  return results.slice(0, 8); // max 8 suggestions
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const { symbol, keyword, action } = body;

    // Action: search by name → return suggestions
    if (action === 'search' && keyword) {
      const suggestions = await searchByName(keyword);
      return new Response(JSON.stringify({ suggestions }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: lookup by symbol code
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol or keyword required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stockInfo = await fetchQuote(symbol);
    if (!stockInfo) {
      return new Response(JSON.stringify({ error: 'Stock not found', symbol }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(stockInfo), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})
