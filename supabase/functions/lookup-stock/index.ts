const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isUSStock(symbol: string): boolean {
  return /^[A-Za-z]{1,5}$/.test(symbol);
}

function toTencentCode(symbol: string): string {
  if (/^0[0-9]{4}$/.test(symbol)) return `hk${symbol}`;
  if (symbol.startsWith('6')) return `sh${symbol}`;
  return `sz${symbol}`;
}

function detectMarket(symbol: string): string {
  if (isUSStock(symbol)) return 'US';
  if (/^0[0-9]{4}$/.test(symbol)) return 'HK';
  if (symbol.startsWith('6')) return 'SH';
  return 'SZ';
}

// ─── Yahoo Finance (US stocks) ───

async function fetchUSQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=1d&range=1d`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const price = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

  const volume = meta.regularMarketVolume ?? 0;
  let volumeStr: string;
  if (volume >= 1_000_000) {
    volumeStr = `${(volume / 1_000_000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    volumeStr = `${(volume / 1000).toFixed(1)}K`;
  } else {
    volumeStr = `${volume}`;
  }

  const marketCap = meta.marketCap ?? 0;
  let marketCapStr: string;
  if (marketCap >= 1e12) {
    marketCapStr = `${(marketCap / 1e12).toFixed(1)}T`;
  } else if (marketCap >= 1e9) {
    marketCapStr = `${(marketCap / 1e9).toFixed(1)}B`;
  } else if (marketCap >= 1e6) {
    marketCapStr = `${(marketCap / 1e6).toFixed(0)}M`;
  } else {
    marketCapStr = `${marketCap}`;
  }

  return {
    symbol: symbol.toUpperCase(),
    name: meta.shortName || meta.longName || symbol.toUpperCase(),
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    volume: volumeStr,
    marketCap: marketCapStr,
    pe: 0,
    sector: '',
    market: 'US',
  };
}

async function searchUSStocks(keyword: string) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(keyword)}&quotesCount=8&newsCount=0`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!resp.ok) return [];
  const json = await resp.json();
  const quotes = json?.quotes || [];
  return quotes
    .filter((q: any) => q.quoteType === 'EQUITY' && q.exchange && !q.symbol.includes('.'))
    .slice(0, 8)
    .map((q: any) => ({
      market: 'us',
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
    }));
}

// ─── Tencent Finance (A-share & HK) ───

async function fetchQuote(symbol: string) {
  const code = toTencentCode(symbol);
  const url = `https://qt.gtimg.cn/q=${code}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://finance.qq.com/',
    },
  });
  const buf = await resp.arrayBuffer();
  const text = new TextDecoder('gbk').decode(buf);
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
  // Search both Chinese and US markets in parallel
  const [cnResults, usResults] = await Promise.all([
    searchCNStocks(keyword),
    searchUSStocks(keyword),
  ]);
  return [...cnResults, ...usResults];
}

async function searchCNStocks(keyword: string) {
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=8`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const json = await resp.json();
  const data = json?.QuotationCodeTable?.Data;
  if (!Array.isArray(data)) return [];

  return data
    .filter((item: any) => item.Classify === 'AStock' || item.Classify === 'HKStock')
    .map((item: any) => ({
      market: item.Classify === 'HKStock' ? 'hk' : (item.JYS === '2' ? 'sh' : 'sz'),
      symbol: item.Code,
      name: item.Name,
    }));
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

    // Route to Yahoo Finance for US stocks, Tencent for CN/HK
    const stockInfo = isUSStock(symbol)
      ? await fetchUSQuote(symbol)
      : await fetchQuote(symbol);

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
