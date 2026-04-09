const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const { code, kline_type = 8, kline_num = 120 } = await req.json()

    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ error: 'code string required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
      console.log(`✓ ${code}: ${data.data.kline_list.length} bars (type=${kline_type})`)
      return new Response(JSON.stringify({ code, klines: data.data.kline_list }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      const errMsg = data.msg || data.error_msg || 'Unknown error'
      console.error(`AllTick error for ${code}:`, errMsg)
      return new Response(JSON.stringify({ code, klines: [], error: errMsg }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    console.error('fetch-kline error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
