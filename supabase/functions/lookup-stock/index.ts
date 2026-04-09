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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { symbol } = await req.json();
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const code = toTencentCode(symbol);
    const url = `https://qt.gtimg.cn/q=${code}`;
    
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.qq.com/',
      },
    });
    
    const text = await resp.text();
    // Format: v_sh600309="1~万华化学~600309~87.59~86.47~87.00~189000~..."
    const match = text.match(/"([^"]*)"/);
    if (!match || !match[1] || match[1].length < 10) {
      return new Response(JSON.stringify({ error: 'Stock not found', symbol }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fields = match[1].split('~');
    // Key fields: 1=name, 2=code, 3=current, 4=prevClose, 5=open, 6=volume(手), 
    // 31=changeAmount, 32=changePercent, 44=totalValue(万), 45=flowValue(万)
    // 38=PE, 39=sector
    const name = fields[1] || '';
    const price = parseFloat(fields[3]) || 0;
    const prevClose = parseFloat(fields[4]) || 0;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? ((change / prevClose) * 100) : 0;
    const volume = parseFloat(fields[6]) || 0; // 手
    const totalValue = parseFloat(fields[45]) || 0; // 万元
    const pe = parseFloat(fields[39]) || 0;

    // Format volume
    let volumeStr: string;
    if (volume >= 10000) {
      volumeStr = `${(volume / 10000).toFixed(1)}万手`;
    } else {
      volumeStr = `${volume.toFixed(0)}手`;
    }

    // Format market cap (万 → 亿)
    let marketCapStr: string;
    if (totalValue >= 10000) {
      marketCapStr = `${(totalValue / 10000).toFixed(0)}亿`;
    } else {
      marketCapStr = `${totalValue.toFixed(0)}万`;
    }

    const market = detectMarket(symbol);

    const stockInfo = {
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
