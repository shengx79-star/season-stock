import { corsHeaders } from '@supabase/supabase-js/cors'

const ALLTICK_BASE = 'https://quote.alltick.co/quote-stock-b-api'

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

    // Fetch kline data for each symbol sequentially (AllTick free tier: 1 req/10s)
    // For paid tiers we could parallelize
    const results: Record<string, unknown> = {}

    // Use batch endpoint if available, otherwise sequential
    // For efficiency, fetch all in parallel and let rate limiting handle itself
    const fetchPromises = symbols.map(async (code: string) => {
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
        return { code, klines: data.data.kline_list }
      } else {
        console.error(`AllTick error for ${code}:`, data)
        return { code, klines: [], error: data.msg || 'Unknown error' }
      }
    })

    const allResults = await Promise.all(fetchPromises)
    for (const r of allResults) {
      results[r.code] = { klines: r.klines, error: (r as { error?: string }).error }
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
