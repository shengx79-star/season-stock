/** Detect market from symbol and return a short Chinese label */
export function detectMarketLabel(symbol: string): string {
  if (/\.(KS|KQ)$/i.test(symbol)) return '韩';
  if (/^[A-Za-z]{1,5}$/.test(symbol)) return '美';
  if (/^[0-9]{4}$/.test(symbol)) return '日';
  if (/^0[0-9]{4}$/.test(symbol)) return '港';
  if (symbol.startsWith('6')) return '沪';
  return '深';
}

export function detectMarketFromTag(market?: string): string {
  const map: Record<string, string> = {
    sh: '沪', sz: '深', hk: '港', us: '美', jp: '日', kr: '韩',
  };
  return market ? (map[market.toLowerCase()] || market) : '';
}

const marketColors: Record<string, string> = {
  '沪': 'bg-red-500/15 text-red-400',
  '深': 'bg-blue-500/15 text-blue-400',
  '港': 'bg-orange-500/15 text-orange-400',
  '美': 'bg-emerald-500/15 text-emerald-400',
  '日': 'bg-purple-500/15 text-purple-400',
  '韩': 'bg-cyan-500/15 text-cyan-400',
};

export function getMarketColorClass(label: string): string {
  return marketColors[label] || 'bg-muted text-muted-foreground';
}
