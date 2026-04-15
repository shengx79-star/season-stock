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

function isKRStock(symbol: string): boolean {
  return /\.(KS|KQ)$/i.test(symbol);
}

function toTencentCode(symbol: string): string {
  if (/^0[0-9]{4}$/.test(symbol)) return `hk${symbol}`;
  if (symbol.startsWith('6')) return `sh${symbol}`;
  return `sz${symbol}`;
}

function detectMarket(symbol: string): string {
  if (isKRStock(symbol)) return 'KR';
  if (isUSStock(symbol)) return 'US';
  if (isJPStock(symbol)) return 'JP';
  if (/^0[0-9]{4}$/.test(symbol)) return 'HK';
  if (symbol.startsWith('6')) return 'SH';
  return 'SZ';
}

// ─── Yahoo Finance (US & JP stocks) ───

async function fetchYahooQuote(symbol: string, market: string) {
  let yahooSymbol: string;
  if (market === 'JP') yahooSymbol = `${symbol}.T`;
  else if (market === 'KR') yahooSymbol = symbol; // already has .KS/.KQ suffix
  else yahooSymbol = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
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
  if (market === 'JP') {
    if (volume >= 100_000_000) volumeStr = `${(volume / 100_000_000).toFixed(1)}億`;
    else if (volume >= 10_000) volumeStr = `${(volume / 10_000).toFixed(1)}万`;
    else volumeStr = `${volume}`;
  } else {
    if (volume >= 1_000_000) volumeStr = `${(volume / 1_000_000).toFixed(1)}M`;
    else if (volume >= 1000) volumeStr = `${(volume / 1000).toFixed(1)}K`;
    else volumeStr = `${volume}`;
  }

  const marketCap = meta.marketCap ?? 0;
  let marketCapStr: string;
  if (market === 'JP') {
    if (marketCap >= 1e12) marketCapStr = `${(marketCap / 1e12).toFixed(1)}兆`;
    else if (marketCap >= 1e8) marketCapStr = `${(marketCap / 1e8).toFixed(0)}億`;
    else marketCapStr = `${marketCap}`;
  } else {
    if (marketCap >= 1e12) marketCapStr = `${(marketCap / 1e12).toFixed(1)}T`;
    else if (marketCap >= 1e9) marketCapStr = `${(marketCap / 1e9).toFixed(1)}B`;
    else if (marketCap >= 1e6) marketCapStr = `${(marketCap / 1e6).toFixed(0)}M`;
    else marketCapStr = `${marketCap}`;
  }

  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    volume: volumeStr,
    marketCap: marketCapStr,
    pe: 0,
    sector: '',
    market,
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
    .filter((q: any) => q.quoteType === 'EQUITY')
    .slice(0, 12)
    .map((q: any) => {
      const sym = q.symbol || '';
      let market = 'us';
      let cleanSymbol = sym;
      if (sym.endsWith('.T')) {
        market = 'jp';
        cleanSymbol = sym.replace('.T', '');
      } else if (sym.endsWith('.KS') || sym.endsWith('.KQ')) {
        market = 'kr';
        cleanSymbol = sym; // keep suffix for unambiguous detection
      } else if (sym.includes('.')) {
        return null; // skip other exchanges
      }
      return { market, symbol: cleanSymbol, name: q.shortname || q.longname || sym };
    })
    .filter(Boolean);
}

// ─── Tencent Finance (A-share & HK) ───

function parseTencentFields(symbol: string, fields: string[]) {
  const name = fields[1] || '';
  const price = parseFloat(fields[3]) || 0;
  const prevClose = parseFloat(fields[4]) || 0;
  const open = parseFloat(fields[5]) || 0;
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? ((change / prevClose) * 100) : 0;
  const volume = parseFloat(fields[6]) || 0;
  const high = parseFloat(fields[33]) || 0;
  const low = parseFloat(fields[34]) || 0;
  const totalValue = parseFloat(fields[45]) || 0;
  const pe = parseFloat(fields[39]) || 0;

  let volumeStr: string;
  if (volume >= 10000) volumeStr = `${(volume / 10000).toFixed(1)}万手`;
  else volumeStr = `${volume.toFixed(0)}手`;

  let marketCapStr: string;
  if (totalValue >= 10000) marketCapStr = `${(totalValue / 10000).toFixed(0)}亿`;
  else marketCapStr = `${totalValue.toFixed(0)}万`;

  const market = detectMarket(symbol);

  return {
    symbol, name, price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    open: Math.round(open * 100) / 100,
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    prevClose: Math.round(prevClose * 100) / 100,
    volume: volumeStr, marketCap: marketCapStr,
    pe: Math.round(pe * 10) / 10, sector: '', market,
  };
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
  const buf = await resp.arrayBuffer();
  const text = new TextDecoder('gbk').decode(buf);
  const match = text.match(/"([^"]*)"/);
  if (!match || !match[1] || match[1].length < 10) return null;
  return parseTencentFields(symbol, match[1].split('~'));
}

// Batch quote: A-share/HK via Tencent, US/JP/KR via Yahoo
async function fetchBatchQuotes(symbols: string[]) {
  const cnSymbols = symbols.filter(s => !isUSStock(s) && !isJPStock(s) && !isKRStock(s));
  const yahooSymbols = symbols.filter(s => isUSStock(s) || isJPStock(s) || isKRStock(s));

  const results: any[] = [];

  // Tencent batch (A-share + HK)
  if (cnSymbols.length > 0) {
    const codes = cnSymbols.map(toTencentCode).join(',');
    const url = `https://qt.gtimg.cn/q=${codes}`;
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://finance.qq.com/',
        },
      });
      const buf = await resp.arrayBuffer();
      const text = new TextDecoder('gbk').decode(buf);
      // Each line: v_sh600519="1~贵州茅台~600519~1500.00~..."
      const lines = text.split('\n').filter(l => l.includes('="'));
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/"([^"]*)"/);
        if (!m || !m[1] || m[1].length < 10) continue;
        const symbol = cnSymbols[i];
        if (!symbol) continue;
        results.push(parseTencentFields(symbol, m[1].split('~')));
      }
    } catch (_) { /* skip on error */ }
  }

  // Yahoo batch (US/JP/KR)
  if (yahooSymbols.length > 0) {
    const yahooList = yahooSymbols.map(s => {
      if (isJPStock(s)) return `${s}.T`;
      return s.toUpperCase();
    });
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooList.join(','))}`;
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (resp.ok) {
        const json = await resp.json();
        const quotes = json?.quoteResponse?.result ?? [];
        for (const q of quotes) {
          const price = q.regularMarketPrice ?? 0;
          const prevClose = q.regularMarketPreviousClose ?? q.chartPreviousClose ?? 0;
          const change = price - prevClose;
          // find original symbol
          const rawSym = q.symbol?.replace(/\.T$/, '') ?? '';
          const origSym = yahooSymbols.find(s => s.toUpperCase() === rawSym.toUpperCase() || `${s}.T` === q.symbol) ?? rawSym;
          const market = detectMarket(origSym);
          const vol = q.regularMarketVolume ?? 0;
          results.push({
            symbol: origSym,
            name: q.shortName || q.longName || origSym,
            price: Math.round(price * 100) / 100,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round((prevClose > 0 ? change / prevClose * 100 : 0) * 100) / 100,
            open: Math.round((q.regularMarketOpen ?? 0) * 100) / 100,
            high: Math.round((q.regularMarketDayHigh ?? 0) * 100) / 100,
            low: Math.round((q.regularMarketDayLow ?? 0) * 100) / 100,
            prevClose: Math.round(prevClose * 100) / 100,
            volume: vol >= 1_000_000 ? `${(vol / 1_000_000).toFixed(1)}M` : vol >= 1000 ? `${(vol / 1000).toFixed(1)}K` : `${vol}`,
            marketCap: '',
            pe: 0, sector: '', market,
          });
        }
      }
    } catch (_) { /* skip on error */ }
  }

  return results;
}

async function searchByName(keyword: string) {
  const [cnResults, yahooResults] = await Promise.all([
    searchCNStocks(keyword),
    searchUSStocks(keyword), // Yahoo covers both US and JP
  ]);
  return [...cnResults, ...yahooResults];
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
    const { symbol, symbols, keyword, action } = body;

    if (action === 'search' && keyword) {
      const suggestions = await searchByName(keyword);
      return new Response(JSON.stringify({ suggestions }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch quote mode (single Tencent batch call + Yahoo batch)
    if (Array.isArray(symbols) && symbols.length > 0) {
      const results = await fetchBatchQuotes(symbols);
      return new Response(JSON.stringify({ results }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol or keyword required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const market = detectMarket(symbol);
    const stockInfo = (market === 'US' || market === 'JP' || market === 'KR')
      ? await fetchYahooQuote(symbol, market)
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
