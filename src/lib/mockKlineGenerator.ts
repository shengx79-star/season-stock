import { Candle } from "./stockClassifier";
import { Season } from "./stockData";

/**
 * 根据股票当前价格和目标季节，生成模拟K线数据
 * 用于前端演示 V2 分类引擎
 */

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

interface KlinePattern {
  trendBias: number;      // 日均涨跌幅偏移 (%)
  volatility: number;     // 日均波动率 (%)
  volumeTrend: number;    // 量能趋势 (1=放量, -1=缩量)
}

const SEASON_PATTERNS: Record<Season, KlinePattern> = {
  spring: { trendBias: 0.3, volatility: 2.0, volumeTrend: 0.5 },
  summer: { trendBias: 0.8, volatility: 1.8, volumeTrend: 1.0 },
  autumn: { trendBias: -0.2, volatility: 2.5, volumeTrend: 0.3 },
  winter: { trendBias: -0.6, volatility: 1.5, volumeTrend: -0.5 },
};

export function generateMockCandles(
  currentPrice: number,
  season: Season,
  dailyCount = 120,
  weeklyCount = 35
): { dailyBars: Candle[]; weeklyBars: Candle[] } {
  const pattern = SEASON_PATTERNS[season];
  const dailyBars: Candle[] = [];

  // 从过去往现在生成日线
  // 先算出起始价 (从当前价反推)
  let price = currentPrice * (1 - (pattern.trendBias / 100) * dailyCount * 0.5);
  if (price <= 0) price = currentPrice * 0.3;

  const baseVolume = 10000000 + Math.random() * 50000000;

  for (let i = dailyCount - 1; i >= 0; i--) {
    const dayChange = (pattern.trendBias + randomInRange(-pattern.volatility, pattern.volatility)) / 100;
    const open = price;
    const close = price * (1 + dayChange);

    const highExtra = Math.abs(close - open) * randomInRange(0.1, 1.5);
    const lowExtra = Math.abs(close - open) * randomInRange(0.1, 1.5);
    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;

    // 量能随时间和季节变化
    const volumeMultiplier = 1 + pattern.volumeTrend * (1 - i / dailyCount) * 0.5;
    const volume = Math.max(100000, baseVolume * volumeMultiplier * randomInRange(0.5, 1.5));

    dailyBars.push({
      date: generateDate(i),
      open: Math.max(0.01, open),
      high: Math.max(0.01, high),
      low: Math.max(0.01, low),
      close: Math.max(0.01, close),
      volume: Math.round(volume),
    });

    price = close;
  }

  // 生成周线 (从日线聚合)
  const weeklyBars: Candle[] = [];
  const totalWeeklyDays = weeklyCount * 5;
  const weeklyStartIdx = Math.max(0, dailyBars.length - totalWeeklyDays);

  for (let w = 0; w < weeklyCount; w++) {
    const startIdx = weeklyStartIdx + w * 5;
    const endIdx = Math.min(startIdx + 5, dailyBars.length);
    if (startIdx >= dailyBars.length) break;

    const weekBars = dailyBars.slice(startIdx, endIdx);
    if (weekBars.length === 0) break;

    weeklyBars.push({
      date: weekBars[0].date,
      open: weekBars[0].open,
      high: Math.max(...weekBars.map(b => b.high)),
      low: Math.min(...weekBars.map(b => b.low)),
      close: weekBars[weekBars.length - 1].close,
      volume: weekBars.reduce((s, b) => s + b.volume, 0),
    });
  }

  return { dailyBars, weeklyBars };
}
