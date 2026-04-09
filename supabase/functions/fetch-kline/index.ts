const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLTICK_BASE = 'https://quote.alltick.co/quote-stock-b-api'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const token = Deno.env.get('ALLTICK_TOKEN')
  if (!token) {
    return new Response(JSON.stringify({ error: 'ALLTICK_TOKEN not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { symbols, kline_type = 8, kline_num = 120 } = await req.json()

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return new Response(JSON.stringify({ error: 'symbols array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results: Record<string, { klines: unknown[]; error?: string }> = {}

    // Free tier: 1 request per 10 seconds, max 10 per minute
    // Fetch sequentially with delay to avoid rate limiting
    for (let i = 0; i < symbols.length; i++) {
      const code = symbols[i]

      // Wait 10s between requests for free tier
      if (i > 0) {
        await sleep(10500)
      }

      try {
        const query = JSON.stringify({
          trace: `${code}-${Date.now()}`,
          data: {
            code,
            kline_type,
            kline_timestamp_end: 0,
            query_kline_num: Math.min(kline_num, 500),
            adjust_type: 0,
          },
        })

        const url = `${ALLTICK_BASE}/kline?token=${token}&query=${encodeURIComponent(query)}`
        const resp = await fetch(url)
        const data = await resp.json()

        if (data.ret === 200 && data.data?.kline_list) {
          results[code] = { klines: data.data.kline_list }
          console.log(`✓ ${code}: ${data.data.kline_list.length} bars`)
        } else {
          console.error(`AllTick error for ${code}:`, data)
          results[code] = { klines: [], error: data.msg || data.error_msg || 'Unknown error' }
        }
      } catch (err) {
        console.error(`Fetch error for ${code}:`, err)
        results[code] = { klines: [], error: 'fetch failed' }
      }
    }

    return new Response(JSON.stringify({ data: results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('fetch-kline error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
