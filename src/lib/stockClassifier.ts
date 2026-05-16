/* eslint-disable @typescript-eslint/no-non-null-assertion */

// =============================================
// V2 四季分类引擎 — 完全按 V2 技术规格文档实现
// =============================================

export type PureStage = "winter" | "spring" | "summer" | "autumn";
export type Stage = PureStage | "unknown";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface Candle {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StageScores {
  winter: number;
  spring: number;
  summer: number;
  autumn: number;
}

export interface ScoreBreakdown {
  trend: StageScores;
  turn: StageScores;
  extension: StageScores;
  weekly: StageScores;
  volume: StageScores;
}

export interface TurnSignals {
  ma514Golden: boolean;
  ma514Dead: boolean;
  ma520Golden: boolean;
  ma520Dead: boolean;
  macdGolden: boolean;
  macdDead: boolean;
  priceReclaimMA20: boolean;
  priceLoseMA20: boolean;
  rsiLowRecovery: boolean;
  rsiHighDrop: boolean;
  kdjRecover: boolean;
  kdjFall: boolean;
  upTurnCount: number;
  downTurnCount: number;
}

export interface IndicatorSnapshot {
  close: number;
  ma5: number | null;
  ma10: number | null;
  ma14: number | null;
  ma20: number | null;
  ma60: number | null;
  maAlignmentScore: number; // 0-3
  rsi14: number | null;
  bias20: number | null;
  bias60: number | null;
  dif: number | null;
  dea: number | null;
  macdHist: number | null;
  k: number | null;
  d: number | null;
  j: number | null;
  bollMid: number | null;
  bollUpper: number | null;
  bollLower: number | null;
  percentB: number | null;
  ma20Slope5: number | null;
  volumeRatio5: number | null;
  obvMA20Ratio: number | null;    // OBV / OBV_MA20，>1=净流入，<1=净流出
  upDownVolRatio: number | null;  // 上涨日均量 / 下跌日均量（20日）
  consecutiveUpDays: number;
  consecutiveDownDays: number;
  dayReturnPct: number | null;
  upperShadowPct: number | null;
  lowerShadowPct: number | null;
  amplitudePct: number | null;

  weekClose: number | null;
  weekMA5: number | null;
  weekMA10: number | null;
  weekDif: number | null;
  weekDea: number | null;
  weekMacdHist: number | null;
}

export interface ClassificationFlags {
  bullAlignment: boolean;
  bearAlignment: boolean;
  weeklyBullish: boolean;
  weeklyBearish: boolean;
  dailyBullStrong: boolean;
  dailyBearStrong: boolean;
  weeklyDailyConflict: boolean;
  springEligible: boolean;
  autumnEligible: boolean;
  lowEvidence: boolean;
}

export interface MediumTermAnalysis {
  stage: Stage;                  // 中期四季：春/夏/秋/冬/unknown（月线维度）
  confidence: number;            // 0-1 中期置信度
  confidenceLevel: ConfidenceLevel;
  accumulationScore: number;     // 0-100 蓄力评分（辅助参考）
  monthlyAlignment: boolean;     // 短期+中期同向看多
}

export interface ClassificationResult {
  stage: Stage;
  quantStage: Stage;
  finalStage: Stage;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  seasonScore: number; // 0-100 温度值
  scores: StageScores;
  scoreBreakdown: ScoreBreakdown;
  turnSignals: TurnSignals;
  flags: ClassificationFlags;
  notes: string[];
  aiCandidates: PureStage[];
  needsAI: boolean;
  indicators: IndicatorSnapshot;
  mediumTermAnalysis: MediumTermAnalysis;
}

export interface ClassificationInput {
  dailyBars: Candle[];   // 必须按时间升序
  weeklyBars: Candle[];  // 必须按时间升序
  currentStage?: Stage;
}

export interface PersistenceState {
  currentStage: PureStage;
  pendingStage: PureStage | null;
  pendingCount: number;
}

export interface PersistenceUpdateResult {
  state: PersistenceState;
  switched: boolean;
  effectivePredictedStage: PureStage;
  originalPredictedStage: PureStage;
  reason: string;
}

// =============================================
// 工具函数
// =============================================

function emptyScores(): StageScores {
  return { winter: 0, spring: 0, summer: 0, autumn: 0 };
}

function cloneScores(s: StageScores): StageScores {
  return { ...s };
}

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function addScore(bucket: StageScores, stage: PureStage, points: number): void {
  bucket[stage] += points;
}

function capScores(bucket: StageScores, cap: number): StageScores {
  return {
    winter: Math.min(bucket.winter, cap),
    spring: Math.min(bucket.spring, cap),
    summer: Math.min(bucket.summer, cap),
    autumn: Math.min(bucket.autumn, cap),
  };
}

function sumScores(...buckets: StageScores[]): StageScores {
  const out = emptyScores();
  for (const b of buckets) {
    out.winter += b.winter;
    out.spring += b.spring;
    out.summer += b.summer;
    out.autumn += b.autumn;
  }
  return out;
}

function topNStages(scores: Record<PureStage, number>, n = 2): [PureStage, number][] {
  return (Object.entries(scores) as [PureStage, number][])
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// =============================================
// 基础指标计算
// =============================================

function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length === 0 || period <= 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiWilder(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    gainSum += Math.max(diff, 0);
    lossSum += Math.max(-diff, 0);
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { dif: Array<number | null>; dea: Array<number | null>; hist: Array<number | null> } {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const dif: Array<number | null> = values.map((_, i) =>
    isNum(fastEma[i]) && isNum(slowEma[i]) ? fastEma[i]! - slowEma[i]! : null
  );
  const difValues = dif.map((v) => v ?? 0);
  const deaRaw = ema(difValues, signal);
  const dea: Array<number | null> = deaRaw.map((v, i) => (isNum(dif[i]) ? v : null));
  // V2: histogram = DIF - DEA (not 2×)
  const hist: Array<number | null> = dif.map((v, i) =>
    isNum(v) && isNum(dea[i]) ? v - dea[i]! : null
  );
  return { dif, dea, hist };
}

function kdj(
  bars: Candle[],
  period = 9
): { k: Array<number | null>; d: Array<number | null>; j: Array<number | null> } {
  const k: Array<number | null> = Array(bars.length).fill(null);
  const d: Array<number | null> = Array(bars.length).fill(null);
  const j: Array<number | null> = Array(bars.length).fill(null);
  let prevK = 50;
  let prevD = 50;
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) continue;
    let highest = -Infinity;
    let lowest = Infinity;
    for (let p = i - period + 1; p <= i; p++) {
      highest = Math.max(highest, bars[p].high);
      lowest = Math.min(lowest, bars[p].low);
    }
    const range = highest - lowest;
    const rsv = range === 0 ? 50 : ((bars[i].close - lowest) / range) * 100;
    const currK = (2 / 3) * prevK + (1 / 3) * rsv;
    const currD = (2 / 3) * prevD + (1 / 3) * currK;
    const currJ = 3 * currK - 2 * currD;
    k[i] = currK;
    d[i] = currD;
    j[i] = currJ;
    prevK = currK;
    prevD = currD;
  }
  return { k, d, j };
}

function bollinger(
  values: number[],
  period = 20,
  stdMultiplier = 2
): { mid: Array<number | null>; upper: Array<number | null>; lower: Array<number | null>; percentB: Array<number | null> } {
  const mid = sma(values, period);
  const upper: Array<number | null> = Array(values.length).fill(null);
  const lower: Array<number | null> = Array(values.length).fill(null);
  const percentB: Array<number | null> = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = mid[i]!;
    const variance = window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper[i] = mean + stdMultiplier * std;
    lower[i] = mean - stdMultiplier * std;
    const denom = upper[i]! - lower[i]!;
    percentB[i] = denom === 0 ? 50 : ((values[i] - lower[i]!) / denom) * 100;
  }
  return { mid, upper, lower, percentB };
}

function calcBias(close: number[], ma: Array<number | null>): Array<number | null> {
  return close.map((c, i) => {
    if (!isNum(ma[i]) || ma[i] === 0) return null;
    return ((c - ma[i]!) / ma[i]!) * 100;
  });
}

function calcSlopePct(series: Array<number | null>, lookback = 5): Array<number | null> {
  const out: Array<number | null> = Array(series.length).fill(null);
  for (let i = lookback; i < series.length; i++) {
    const curr = series[i];
    const prev = series[i - lookback];
    if (!isNum(curr) || !isNum(prev) || prev === 0) continue;
    out[i] = ((curr - prev) / prev) * 100;
  }
  return out;
}

/** V2: volumeRatio5 = volume[latest] / avg(volume[latest-5..latest-1]) */
function calcVolumeRatio5(bars: Candle[]): Array<number | null> {
  const out: Array<number | null> = Array(bars.length).fill(null);
  for (let i = 5; i < bars.length; i++) {
    const avg = bars.slice(i - 5, i).reduce((acc, b) => acc + b.volume, 0) / 5;
    out[i] = avg === 0 ? null : bars[i].volume / avg;
  }
  return out;
}

function computeOBV(bars: Candle[]): number[] {
  const obv: number[] = Array(bars.length).fill(0);
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) obv[i] = obv[i - 1] + bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) obv[i] = obv[i - 1] - bars[i].volume;
    else obv[i] = obv[i - 1];
  }
  return obv;
}

function computeUpDownVolRatio(bars: Candle[]): number | null {
  if (bars.length < 5) return null;
  const recent = bars.slice(-20);
  let upVol = 0, upCount = 0, downVol = 0, downCount = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].close > recent[i - 1].close) { upVol += recent[i].volume; upCount++; }
    else if (recent[i].close < recent[i - 1].close) { downVol += recent[i].volume; downCount++; }
  }
  const avgUp = upCount > 0 ? upVol / upCount : 0;
  const avgDown = downCount > 0 ? downVol / downCount : 0;
  if (avgDown === 0) return null;
  return avgUp / avgDown;
}

/** V2: 连续涨跌用 close vs open 判断 */
function calcStreaksV2(bars: Candle[]): { consecutiveUpDays: number; consecutiveDownDays: number } {
  let up = 0;
  let down = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].close > bars[i].open && down === 0) up++;
    else if (bars[i].close < bars[i].open && up === 0) down++;
    else break;
  }
  return { consecutiveUpDays: up, consecutiveDownDays: down };
}

function dayReturnPct(bars: Candle[]): number | null {
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2].close;
  const curr = bars[bars.length - 1].close;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function shadowRatios(lastBar: Candle): { upperShadowPct: number | null; lowerShadowPct: number | null } {
  const range = lastBar.high - lastBar.low;
  if (range <= 0) return { upperShadowPct: null, lowerShadowPct: null };
  const upperShadow = lastBar.high - Math.max(lastBar.open, lastBar.close);
  const lowerShadow = Math.min(lastBar.open, lastBar.close) - lastBar.low;
  return {
    upperShadowPct: (upperShadow / range) * 100,
    lowerShadowPct: (lowerShadow / range) * 100,
  };
}

function amplitudePct(bars: Candle[]): number | null {
  const curr = last(bars);
  const prev = bars.length >= 2 ? bars[bars.length - 2] : undefined;
  if (!curr) return null;
  const base = prev?.close ?? curr.open;
  if (base === 0) return null;
  return ((curr.high - curr.low) / base) * 100;
}

/** V2: MA排列评分 0-3 */
function calcMAAlignmentScore(ma5: number | null, ma10: number | null, ma20: number | null, ma60: number | null): number {
  if (!isNum(ma5) || !isNum(ma10) || !isNum(ma20) || !isNum(ma60)) return -1; // 不可计算

  // 3 = 多头排列 MA5>MA10>MA20>MA60
  if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) return 3;
  // 0 = 空头排列 MA5<MA10<MA20<MA60
  if (ma5 < ma10 && ma10 < ma20 && ma20 < ma60) return 0;
  // 2 = 部分多头 MA5>MA20
  if (ma5 > ma20) return 2;
  // 1 = 部分空头 MA5<MA20
  return 1;
}

// =============================================
// 信号检测
// =============================================

function crossedAboveWithin(
  a: Array<number | null>,
  b: Array<number | null>,
  lookback: number
): boolean {
  const start = Math.max(1, a.length - lookback);
  for (let i = start; i < a.length; i++) {
    if (
      isNum(a[i - 1]) && isNum(b[i - 1]) && isNum(a[i]) && isNum(b[i]) &&
      a[i - 1]! <= b[i - 1]! && a[i]! > b[i]!
    ) return true;
  }
  return false;
}

function crossedBelowWithin(
  a: Array<number | null>,
  b: Array<number | null>,
  lookback: number
): boolean {
  const start = Math.max(1, a.length - lookback);
  for (let i = start; i < a.length; i++) {
    if (
      isNum(a[i - 1]) && isNum(b[i - 1]) && isNum(a[i]) && isNum(b[i]) &&
      a[i - 1]! >= b[i - 1]! && a[i]! < b[i]!
    ) return true;
  }
  return false;
}

// =============================================
// 指标上下文构建
// =============================================

function buildIndicatorContext(dailyBars: Candle[], weeklyBars: Candle[]) {
  const close = dailyBars.map((b) => b.close);
  const weekClose = weeklyBars.map((b) => b.close);

  const ma5 = sma(close, 5);
  const ma10 = sma(close, 10);
  const ma14 = sma(close, 14);
  const ma20 = sma(close, 20);
  const ma60 = sma(close, 60);

  const rsi14 = rsiWilder(close, 14);
  const { dif, dea, hist } = macd(close, 12, 26, 9);
  const { k, d, j } = kdj(dailyBars, 9);
  const { mid, upper, lower, percentB } = bollinger(close, 20, 2);

  const bias20 = calcBias(close, ma20);
  const bias60 = calcBias(close, ma60);
  const ma20Slope5 = calcSlopePct(ma20, 5);
  const volumeRatio5 = calcVolumeRatio5(dailyBars);
  const obvRaw = computeOBV(dailyBars);
  const obvMA20 = sma(obvRaw, 20);

  const weekMA5 = sma(weekClose, 5);
  const weekMA10 = sma(weekClose, 10);
  const weekMacd = macd(weekClose, 12, 26, 9);

  return {
    close,
    ma5, ma10, ma14, ma20, ma60,
    rsi14, bias20, bias60,
    dif, dea, hist,
    k, d, j,
    bollMid: mid, bollUpper: upper, bollLower: lower, percentB,
    ma20Slope5, volumeRatio5,
    obvRaw, obvMA20,
    weekClose, weekMA5, weekMA10,
    weekDif: weekMacd.dif, weekDea: weekMacd.dea, weekHist: weekMacd.hist,
  };
}

/** V2: turn count 前端版只用 3 项 (MA5/14金死叉 + MACD金死叉 + 价格穿越MA20) lookback=10 */
function computeTurnSignals(ctx: ReturnType<typeof buildIndicatorContext>): TurnSignals {
  // V2: lookback=10 for MA crosses
  const ma514Golden = crossedAboveWithin(ctx.ma5, ctx.ma14, 10);
  const ma514Dead = crossedBelowWithin(ctx.ma5, ctx.ma14, 10);
  const ma520Golden = crossedAboveWithin(ctx.ma5, ctx.ma20, 10);
  const ma520Dead = crossedBelowWithin(ctx.ma5, ctx.ma20, 10);

  // V2: MACD lookback=5
  const macdGolden = crossedAboveWithin(ctx.dif, ctx.dea, 5);
  const macdDead = crossedBelowWithin(ctx.dif, ctx.dea, 5);

  // V2: 价格穿越MA20, lookback=5
  const priceReclaimMA20 = crossedAboveWithin(
    ctx.close.map((v) => v), ctx.ma20, 5
  );
  const priceLoseMA20 = crossedBelowWithin(
    ctx.close.map((v) => v), ctx.ma20, 5
  );

  // RSI/KDJ signals (used in scoring, NOT in turn count for frontend version)
  const rsi5Ago = ctx.rsi14.length > 5 ? ctx.rsi14[ctx.rsi14.length - 6] : null;
  const rsiNow = last(ctx.rsi14) ?? null;
  const rsiLowRecovery = isNum(rsi5Ago) && isNum(rsiNow) && rsi5Ago <= 35 && rsiNow > 35;
  const rsiHighDrop = isNum(rsi5Ago) && isNum(rsiNow) && rsi5Ago >= 65 && rsiNow < 65;
  const kdjRecover = isNum(last(ctx.j)) && last(ctx.j)! < 20;
  const kdjFall = isNum(last(ctx.j)) && last(ctx.j)! > 80;

  // V2 前端版: turn count 仅用 3 项
  const upTurnCount = [ma514Golden, macdGolden, priceReclaimMA20].filter(Boolean).length;
  const downTurnCount = [ma514Dead, macdDead, priceLoseMA20].filter(Boolean).length;

  return {
    ma514Golden, ma514Dead,
    ma520Golden, ma520Dead,
    macdGolden, macdDead,
    priceReclaimMA20, priceLoseMA20,
    rsiLowRecovery, rsiHighDrop,
    kdjRecover, kdjFall,
    upTurnCount, downTurnCount,
  };
}

function latestSnapshot(
  dailyBars: Candle[],
  _weeklyBars: Candle[],
  ctx: ReturnType<typeof buildIndicatorContext>
): IndicatorSnapshot {
  const close = last(ctx.close)!;
  const streaks = calcStreaksV2(dailyBars);
  const shadows = shadowRatios(last(dailyBars)!);

  const ma5v = last(ctx.ma5) ?? null;
  const ma10v = last(ctx.ma10) ?? null;
  const ma20v = last(ctx.ma20) ?? null;
  const ma60v = last(ctx.ma60) ?? null;
  const maAlign = calcMAAlignmentScore(ma5v, ma10v, ma20v, ma60v);

  return {
    close,
    ma5: ma5v,
    ma10: ma10v,
    ma14: last(ctx.ma14) ?? null,
    ma20: ma20v,
    ma60: ma60v,
    maAlignmentScore: maAlign >= 0 ? maAlign : 0,
    rsi14: last(ctx.rsi14) ?? null,
    bias20: last(ctx.bias20) ?? null,
    bias60: last(ctx.bias60) ?? null,
    dif: last(ctx.dif) ?? null,
    dea: last(ctx.dea) ?? null,
    macdHist: last(ctx.hist) ?? null,
    k: last(ctx.k) ?? null,
    d: last(ctx.d) ?? null,
    j: last(ctx.j) ?? null,
    bollMid: last(ctx.bollMid) ?? null,
    bollUpper: last(ctx.bollUpper) ?? null,
    bollLower: last(ctx.bollLower) ?? null,
    percentB: last(ctx.percentB) ?? null,
    ma20Slope5: last(ctx.ma20Slope5) ?? null,
    volumeRatio5: last(ctx.volumeRatio5) ?? null,
    obvMA20Ratio: (() => {
      const o = last(ctx.obvRaw);
      const m = last(ctx.obvMA20);
      return (isNum(o) && isNum(m) && m !== 0) ? round2(o / m) : null;
    })(),
    upDownVolRatio: computeUpDownVolRatio(dailyBars),
    consecutiveUpDays: streaks.consecutiveUpDays,
    consecutiveDownDays: streaks.consecutiveDownDays,
    dayReturnPct: dayReturnPct(dailyBars),
    upperShadowPct: shadows.upperShadowPct,
    lowerShadowPct: shadows.lowerShadowPct,
    amplitudePct: amplitudePct(dailyBars),

    weekClose: last(ctx.weekClose) ?? null,
    weekMA5: last(ctx.weekMA5) ?? null,
    weekMA10: last(ctx.weekMA10) ?? null,
    weekDif: last(ctx.weekDif) ?? null,
    weekDea: last(ctx.weekDea) ?? null,
    weekMacdHist: last(ctx.weekHist) ?? null,
  };
}

// =============================================
// 核心分类引擎
// =============================================

const EMPTY_TURN_SIGNALS: TurnSignals = {
  ma514Golden: false, ma514Dead: false,
  ma520Golden: false, ma520Dead: false,
  macdGolden: false, macdDead: false,
  priceReclaimMA20: false, priceLoseMA20: false,
  rsiLowRecovery: false, rsiHighDrop: false,
  kdjRecover: false, kdjFall: false,
  upTurnCount: 0, downTurnCount: 0,
};

const EMPTY_INDICATOR: IndicatorSnapshot = {
  close: 0,
  ma5: null, ma10: null, ma14: null, ma20: null, ma60: null,
  maAlignmentScore: 0,
  rsi14: null, bias20: null, bias60: null,
  dif: null, dea: null, macdHist: null,
  k: null, d: null, j: null,
  bollMid: null, bollUpper: null, bollLower: null, percentB: null,
  ma20Slope5: null, volumeRatio5: null,
  obvMA20Ratio: null, upDownVolRatio: null,
  consecutiveUpDays: 0, consecutiveDownDays: 0,
  dayReturnPct: null, upperShadowPct: null, lowerShadowPct: null, amplitudePct: null,
  weekClose: null, weekMA5: null, weekMA10: null,
  weekDif: null, weekDea: null, weekMacdHist: null,
};

/** V2: Season Score 温度映射 */
const TEMP_MAP: Record<PureStage, number> = { winter: 10, spring: 40, summer: 80, autumn: 60 };

function calcSeasonScore(scores: StageScores): number {
  const total = scores.winter + scores.spring + scores.summer + scores.autumn;
  if (total === 0) return 50;
  return Math.round(
    (scores.winter * TEMP_MAP.winter +
      scores.spring * TEMP_MAP.spring +
      scores.summer * TEMP_MAP.summer +
      scores.autumn * TEMP_MAP.autumn) / total
  );
}

// =============================================
// 中期分析辅助函数
// =============================================

function computeMonthlyBars(dailyBars: Candle[]): Candle[] {
  const monthMap = new Map<string, { open: number; high: number; low: number; close: number; volume: number }>();
  for (const bar of dailyBars) {
    const month = bar.date.slice(0, 7);
    const ex = monthMap.get(month);
    if (!ex) {
      monthMap.set(month, { open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
    } else {
      ex.high = Math.max(ex.high, bar.high);
      ex.low = Math.min(ex.low, bar.low);
      ex.close = bar.close;
      ex.volume += bar.volume;
    }
  }
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ date: month + "-01", open: v.open, high: v.high, low: v.low, close: v.close, volume: v.volume }));
}

function classifyMonthly(monthlyBars: Candle[]): { stage: Stage; confidence: number } {
  if (monthlyBars.length < 5) return { stage: "unknown", confidence: 0 };

  const closes = monthlyBars.map(b => b.close);
  const n = closes.length;
  const ma3Arr = sma(closes, 3);
  const ma5Arr = sma(closes, 5);
  const ma10Arr = sma(closes, Math.min(10, n));

  const i = n - 1;
  const close = closes[i];
  const ma3 = ma3Arr[i];
  const ma5 = ma5Arr[i];
  const ma10 = ma10Arr[i];

  if (ma3 === null || ma5 === null) return { stage: "unknown", confidence: 0 };

  const scores = emptyScores();

  // MA3 vs MA5：短期月线动量
  if (close > ma3 && ma3 > ma5) addScore(scores, "summer", 3);
  else if (close < ma3 && ma3 < ma5) addScore(scores, "winter", 3);
  else if (close > ma5 && ma3 <= ma5) addScore(scores, "spring", 2);
  else if (close < ma5 && ma3 >= ma5) addScore(scores, "autumn", 2);

  // close vs MA5
  if (close > ma5) addScore(scores, "summer", 2);
  else addScore(scores, "winter", 2);

  // MA5 斜率（与2个月前比较）
  const ma5Prev = i >= 2 ? ma5Arr[i - 2] : null;
  if (ma5Prev !== null && ma5Prev > 0) {
    const slope = (ma5 - ma5Prev) / ma5Prev;
    if (slope > 0.01) addScore(scores, "summer", 2);
    else if (slope > 0) addScore(scores, "spring", 1);
    else if (slope < -0.01) addScore(scores, "winter", 2);
    else addScore(scores, "autumn", 1);
  }

  // MA10（若有）：价格与长期月均线的位置关系（权重最重）
  if (ma10 !== null) {
    if (close > ma10) {
      if (ma5 > ma10) addScore(scores, "summer", 3);  // 完整月线多头
      else addScore(scores, "spring", 4);              // 价格在MA10之上但MA5尚未突破：春季启动区
    } else {
      if (ma5 > ma10) addScore(scores, "autumn", 4);  // 价格跌破MA10但MA5仍高：秋季分发区
      else addScore(scores, "winter", 3);              // 完整月线空头
    }
  }

  const tops = topNStages(scores, 2);
  if (tops.length === 0) return { stage: "unknown", confidence: 0 };
  const [top1Stage, top1Score] = tops[0];
  const top2Score = tops.length > 1 ? tops[1][1] : 0;
  if (top1Score === 0) return { stage: "unknown", confidence: 0 };

  const strength = Math.min(top1Score / 10, 1);
  const separation = (top1Score - top2Score) / top1Score;
  const confidence = round2(0.5 * strength + 0.5 * separation);
  return { stage: top1Stage, confidence };
}

function computeAccumulationScore(dailyBars: Candle[], ma60Val: number | null): number {
  if (dailyBars.length < 60 || ma60Val === null || ma60Val === 0) return 0;
  const recent60 = dailyBars.slice(-60);

  // Base Width: days within ±8% of MA60 → max 40 pts
  const baseCount = recent60.filter(b => Math.abs(b.close - ma60Val) / ma60Val <= 0.08).length;
  const baseWidthScore = (baseCount / 60) * 40;

  // Volatility Contraction: ATR20 / ATR60 → max 30 pts
  let atr20 = 0, atr60 = 0;
  if (dailyBars.length >= 21) {
    const bars = dailyBars.slice(-21);
    let s = 0;
    for (let i = 1; i < bars.length; i++)
      s += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i-1].close), Math.abs(bars[i].low - bars[i-1].close));
    atr20 = s / 20;
  }
  if (dailyBars.length >= 61) {
    const bars = dailyBars.slice(-61);
    let s = 0;
    for (let i = 1; i < bars.length; i++)
      s += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i-1].close), Math.abs(bars[i].low - bars[i-1].close));
    atr60 = s / 60;
  }
  const volContScore = (atr60 > 0 && atr20 > 0)
    ? Math.max(0, Math.min(30, (1 - atr20 / atr60) / 0.3 * 30))
    : 0;

  // Volume Dry-up: recent 20 vs older 40 avg volume, only when above MA60 → max 30 pts
  let volDryScore = 0;
  const lastClose = recent60[recent60.length - 1].close;
  if (lastClose > ma60Val) {
    const recent20Vol = recent60.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
    const older40Vol = recent60.slice(0, 40).reduce((s, b) => s + b.volume, 0) / 40;
    if (older40Vol > 0)
      volDryScore = Math.max(0, Math.min(30, (1 - recent20Vol / older40Vol) / 0.4 * 30));
  }

  return Math.round(baseWidthScore + volContScore + volDryScore);
}

function computeMediumTermAnalysis(
  dailyBars: Candle[],
  ma60Val: number | null,
  shortTermStage: PureStage,
  weeklyBullish: boolean,
): MediumTermAnalysis {
  const monthlyBars = computeMonthlyBars(dailyBars);
  const { stage, confidence } = classifyMonthly(monthlyBars);
  const confidenceLevel: ConfidenceLevel =
    confidence >= 0.75 ? "high" : confidence >= 0.55 ? "medium" : "low";

  const accumulationScore = computeAccumulationScore(dailyBars, ma60Val);

  const shortBullish = shortTermStage === "spring" || shortTermStage === "summer";
  const medBullish = stage === "spring" || stage === "summer";
  const monthlyAlignment = shortBullish && weeklyBullish && medBullish;

  return { stage, confidence, confidenceLevel, accumulationScore, monthlyAlignment };
}

const DEFAULT_MEDIUM_TERM: MediumTermAnalysis = {
  stage: "unknown",
  confidence: 0,
  confidenceLevel: "low",
  accumulationScore: 0,
  monthlyAlignment: false,
};

export function classifyStock(input: ClassificationInput): ClassificationResult {
  const { dailyBars, weeklyBars, currentStage = "unknown" } = input;

  if (dailyBars.length < 60 || weeklyBars.length < 10) {
    return {
      stage: "unknown", quantStage: "unknown", finalStage: "unknown",
      confidence: 0, confidenceLevel: "low", seasonScore: 50,
      scores: emptyScores(),
      scoreBreakdown: { trend: emptyScores(), turn: emptyScores(), extension: emptyScores(), weekly: emptyScores(), volume: emptyScores() },
      turnSignals: EMPTY_TURN_SIGNALS,
      flags: {
        bullAlignment: false, bearAlignment: false,
        weeklyBullish: false, weeklyBearish: false,
        dailyBullStrong: false, dailyBearStrong: false,
        weeklyDailyConflict: false,
        springEligible: false, autumnEligible: false, lowEvidence: true,
      },
      notes: ["数据不足：需要至少60根日线和10根周线"],
      aiCandidates: [], needsAI: false,
      indicators: { ...EMPTY_INDICATOR, close: last(dailyBars)?.close ?? 0 },
      mediumTermAnalysis: DEFAULT_MEDIUM_TERM,
    };
  }

  const ctx = buildIndicatorContext(dailyBars, weeklyBars);
  const signals = computeTurnSignals(ctx);
  const indicators = latestSnapshot(dailyBars, weeklyBars, ctx);
  const notes: string[] = [];

  const trendRaw = emptyScores();
  const turnRaw = emptyScores();
  const extensionRaw = emptyScores();
  const weeklyRaw = emptyScores();

  const {
    close, ma20, ma60, rsi14, bias20, bias60,
    macdHist: histVal, percentB, ma20Slope5, volumeRatio5,
    j, upperShadowPct, lowerShadowPct, dayReturnPct: dayRet, amplitudePct: amplitude,
    maAlignmentScore: maAlign,
  } = indicators;

  const weeklyBullish =
    isNum(indicators.weekClose) && isNum(indicators.weekMA5) && isNum(indicators.weekMA10) &&
    indicators.weekClose > indicators.weekMA5 && indicators.weekMA5 > indicators.weekMA10;

  const weeklyBearish =
    isNum(indicators.weekClose) && isNum(indicators.weekMA5) && isNum(indicators.weekMA10) &&
    indicators.weekClose < indicators.weekMA5 && indicators.weekMA5 < indicators.weekMA10;

  const bullAlignment = maAlign === 3;
  const bearAlignment = maAlign === 0;
  const dailyBullStrong = bullAlignment && isNum(ma20) && isNum(ma60) && close > ma20 && close > ma60;
  const dailyBearStrong = bearAlignment && isNum(ma20) && isNum(ma60) && close < ma20 && close < ma60;
  const weeklyDailyConflict =
    (dailyBullStrong && weeklyBearish) || (dailyBearStrong && weeklyBullish);

  // ==========================================
  // 1) TREND（上限 6）
  // ==========================================

  // 均线排列
  if (maAlign === 3) {
    addScore(trendRaw, "summer", 4);
    notes.push("趋势: 均线排列=3，多头排列 → summer+4");
  } else if (maAlign === 0) {
    addScore(trendRaw, "winter", 4);
    notes.push("趋势: 均线排列=0，空头排列 → winter+4");
  } else if (maAlign === 2) {
    addScore(trendRaw, "summer", 2);
    notes.push("趋势: 均线排列=2，部分多头 → summer+2");
  } else if (maAlign === 1) {
    addScore(trendRaw, "winter", 2);
    notes.push("趋势: 均线排列=1，部分空头 → winter+2");
  }

  // 价格 vs MA20/MA60
  if (isNum(ma20) && isNum(ma60)) {
    if (close > ma20 && close > ma60) {
      addScore(trendRaw, "summer", 2);
      notes.push("趋势: 价格>MA20且>MA60 → summer+2");
    } else if (close < ma20 && close < ma60) {
      addScore(trendRaw, "winter", 2);
      notes.push("趋势: 价格<MA20且<MA60 → winter+2");
    } else if (close > ma20 && close < ma60) {
      addScore(trendRaw, "spring", 3);
      notes.push("趋势: 价格>MA20且<MA60（春季位置） → spring+3");
    } else if (close < ma20 && close > ma60) {
      addScore(trendRaw, "autumn", 3);
      notes.push("趋势: 价格<MA20且>MA60（秋季位置） → autumn+3");
    }
  }

  // MA20 斜率
  if (isNum(ma20Slope5)) {
    if (ma20Slope5 > 1.0) {
      addScore(trendRaw, "summer", 1);
      notes.push("趋势: MA20斜率>1% → summer+1");
    } else if (ma20Slope5 < -1.0) {
      addScore(trendRaw, "winter", 1);
      notes.push("趋势: MA20斜率<-1% → winter+1");
    } else if (ma20Slope5 > 0 && signals.upTurnCount >= 2) {
      addScore(trendRaw, "spring", 1);
      notes.push("趋势: MA20斜率>0且up_turn≥2 → spring+1");
    } else if (ma20Slope5 < 0 && signals.downTurnCount >= 2) {
      addScore(trendRaw, "autumn", 1);
      notes.push("趋势: MA20斜率<0且down_turn≥2 → autumn+1");
    }
  }

  // V2: MACD柱正负
  if (isNum(histVal)) {
    if (histVal > 0) {
      addScore(trendRaw, "summer", 2);
      notes.push("趋势: MACD柱>0 → summer+2");
    } else {
      addScore(trendRaw, "winter", 2);
      notes.push("趋势: MACD柱≤0 → winter+2");
    }
  }

  // ==========================================
  // 2) TURN（上限 6）
  // ==========================================

  if (signals.ma514Golden) { addScore(turnRaw, "spring", 3); notes.push("转折: MA5/14金叉 → spring+3"); }
  if (signals.ma514Dead) { addScore(turnRaw, "autumn", 3); notes.push("转折: MA5/14死叉 → autumn+3"); }
  if (signals.ma520Golden) { addScore(turnRaw, "spring", 2); notes.push("转折: MA5/20金叉 → spring+2"); }
  if (signals.ma520Dead) { addScore(turnRaw, "autumn", 2); notes.push("转折: MA5/20死叉 → autumn+2"); }
  if (signals.macdGolden) { addScore(turnRaw, "spring", 3); notes.push("转折: MACD金叉 → spring+3"); }
  if (signals.macdDead) { addScore(turnRaw, "autumn", 3); notes.push("转折: MACD死叉 → autumn+3"); }
  if (signals.priceReclaimMA20) { addScore(turnRaw, "spring", 2); notes.push("转折: 价格上穿MA20 → spring+2"); }
  if (signals.priceLoseMA20) { addScore(turnRaw, "autumn", 2); notes.push("转折: 价格下穿MA20 → autumn+2"); }

  // V2: RSI<30 按 turn_count 分配
  if (isNum(rsi14)) {
    if (rsi14 < 30) {
      if (signals.upTurnCount >= 2) {
        addScore(turnRaw, "spring", 1);
        notes.push("转折: RSI<30且up_turn≥2 → spring+1");
      } else {
        addScore(turnRaw, "winter", 1);
        notes.push("转折: RSI<30且up_turn<2 → winter+1");
      }
    }
    if (rsi14 > 70) {
      if (signals.downTurnCount >= 2) {
        addScore(turnRaw, "autumn", 1);
        notes.push("转折: RSI>70且down_turn≥2 → autumn+1");
      } else {
        addScore(turnRaw, "summer", 1);
        notes.push("转折: RSI>70且down_turn<2 → summer+1");
      }
    }
  }

  // V2: KDJ J<20 → spring+1, J>80 → autumn+1
  if (isNum(j)) {
    if (j < 20) { addScore(turnRaw, "spring", 1); notes.push("转折: KDJ J<20 → spring+1"); }
    if (j > 80) { addScore(turnRaw, "autumn", 1); notes.push("转折: KDJ J>80 → autumn+1"); }
  }

  // ==========================================
  // 3) EXTENSION（上限 3）
  // ==========================================

  if (isNum(percentB)) {
    if (percentB <= 20) {
      if (signals.upTurnCount >= 2) {
        addScore(extensionRaw, "spring", 1);
        notes.push("扩展: %B≤20且up_turn≥2 → spring+1");
      } else {
        addScore(extensionRaw, "winter", 2);
        notes.push("扩展: %B≤20且up_turn<2 → winter+2");
      }
    } else if (percentB >= 80) {
      if (signals.downTurnCount >= 2) {
        addScore(extensionRaw, "autumn", 2);
        notes.push("扩展: %B≥80且down_turn≥2 → autumn+2");
      } else {
        addScore(extensionRaw, "summer", 1);
        notes.push("扩展: %B≥80且down_turn<2 → summer+1");
      }
    } else {
      // V2: %B < 50 → spring+1, %B >= 50 → summer+1
      if (percentB < 50) {
        addScore(extensionRaw, "spring", 1);
        notes.push("扩展: %B<50 → spring+1");
      } else {
        addScore(extensionRaw, "summer", 1);
        notes.push("扩展: %B≥50 → summer+1");
      }
    }
  }

  // RSI extreme in extension
  if (isNum(rsi14)) {
    if (rsi14 < 30 && signals.upTurnCount >= 2) {
      addScore(extensionRaw, "spring", 1);
      notes.push("扩展: RSI<30且up_turn≥2 → spring+1");
    }
    if (rsi14 > 70 && signals.downTurnCount >= 2) {
      addScore(extensionRaw, "autumn", 1);
      notes.push("扩展: RSI>70且down_turn≥2 → autumn+1");
    }
  }

  // BIAS
  if (isNum(bias20)) {
    if (bias20 > 8 && signals.downTurnCount >= 2) {
      addScore(extensionRaw, "autumn", 1);
      notes.push("扩展: BIAS20>8%且down_turn≥2 → autumn+1");
    }
    if (bias20 < -8 && signals.upTurnCount >= 2) {
      addScore(extensionRaw, "spring", 1);
      notes.push("扩展: BIAS20<-8%且up_turn≥2 → spring+1");
    }
  }

  // V2: BIAS60 > 15 → autumn+2（无需 turn_count）
  if (isNum(bias60) && bias60 > 15) {
    addScore(extensionRaw, "autumn", 2);
    notes.push("扩展: BIAS60>15%（强信号） → autumn+2");
  }

  // 连续涨跌 (V2: close vs open)
  if (indicators.consecutiveUpDays >= 5) {
    addScore(extensionRaw, "summer", 1);
    notes.push("扩展: 连涨≥5天 → summer+1");
  }
  if (indicators.consecutiveDownDays >= 5) {
    addScore(extensionRaw, "winter", 1);
    notes.push("扩展: 连跌≥5天 → winter+1");
  }

  // V2: 日内涨跌幅多档
  if (isNum(dayRet)) {
    if (dayRet <= -3) {
      addScore(extensionRaw, "winter", 2);
      notes.push("扩展: 日内跌≤-3% → winter+2");
    } else if (dayRet <= -1) {
      addScore(extensionRaw, "winter", 1);
      notes.push("扩展: 日内跌≤-1% → winter+1");
    }
    if (dayRet >= 3) {
      addScore(extensionRaw, "summer", 1);
      notes.push("扩展: 日内涨≥3% → summer+1");
    } else if (dayRet >= 1) {
      addScore(extensionRaw, "spring", 1);
      notes.push("扩展: 日内涨≥1% → spring+1");
    }
  }

  // 影线
  if (isNum(upperShadowPct) && upperShadowPct >= 40) {
    addScore(extensionRaw, "autumn", 1);
    notes.push("扩展: 上影线≥40% → autumn+1");
  }
  if (isNum(lowerShadowPct) && lowerShadowPct >= 40) {
    addScore(extensionRaw, "spring", 1);
    notes.push("扩展: 下影线≥40% → spring+1");
  }

  // 放量
  if (isNum(volumeRatio5) && isNum(dayRet)) {
    if (volumeRatio5 > 2 && dayRet > 2) {
      addScore(extensionRaw, "summer", 1);
      notes.push("扩展: 放量上涨 → summer+1");
    }
    if (volumeRatio5 > 2 && isNum(amplitude) && amplitude > 4 && signals.downTurnCount >= 1) {
      addScore(extensionRaw, "autumn", 1);
      notes.push("扩展: 放量大振幅+转弱 → autumn+1");
    }
  }

  // ==========================================
  // 4) WEEKLY（上限 3）
  // ==========================================
  if (weeklyBullish) {
    addScore(weeklyRaw, "summer", 2);
    notes.push("周线: 收盘>WMA5>WMA10 → summer+2");
  }
  if (weeklyBearish) {
    addScore(weeklyRaw, "winter", 2);
    notes.push("周线: 收盘<WMA5<WMA10 → winter+2");
  }

  // V2: 周线 MACD 柱 3周前 vs 当前的正负翻转（需≥35周数据）
  if (weeklyBars.length >= 35 && ctx.weekHist.length >= 4) {
    const hist3WeeksAgo = ctx.weekHist[ctx.weekHist.length - 4];
    const histNow = last(ctx.weekHist);
    if (isNum(hist3WeeksAgo) && isNum(histNow)) {
      if (hist3WeeksAgo <= 0 && histNow > 0) {
        addScore(weeklyRaw, "spring", 2);
        notes.push("周线: MACD柱3周前≤0→当前>0 → spring+2");
      }
      if (hist3WeeksAgo >= 0 && histNow < 0) {
        addScore(weeklyRaw, "autumn", 2);
        notes.push("周线: MACD柱3周前≥0→当前<0 → autumn+2");
      }
    }
  }

  // ==========================================
  // 5) VOLUME（上限 4）
  // ==========================================
  const volumeRaw = emptyScores();

  // OBV vs OBV_MA20：资金净流向（2分）
  {
    const obvCurr = last(ctx.obvRaw);
    const obvMA20Val = last(ctx.obvMA20);
    if (isNum(obvCurr) && isNum(obvMA20Val) && obvMA20Val !== 0) {
      if (obvCurr > obvMA20Val) {
        if (isNum(ma20) && close > ma20) {
          addScore(volumeRaw, "summer", 2);
          notes.push("量: OBV>均线且价格强势 → summer+2");
        } else {
          addScore(volumeRaw, "spring", 2);
          notes.push("量: OBV>均线但价格偏低 = 隐性吸筹 → spring+2");
        }
      } else {
        if (isNum(ma20) && close < ma20) {
          addScore(volumeRaw, "winter", 2);
          notes.push("量: OBV<均线且价格弱势 → winter+2");
        } else {
          addScore(volumeRaw, "autumn", 2);
          notes.push("量: OBV<均线但价格偏高 = 隐性派发 → autumn+2");
        }
      }
    }
  }

  // 涨跌日成交量比（1分）
  {
    const udRatio = computeUpDownVolRatio(dailyBars);
    if (isNum(udRatio)) {
      if (udRatio > 1.5) {
        const s = (isNum(ma20) && close > ma20) ? "summer" : "spring";
        addScore(volumeRaw, s, 1);
        notes.push(`量: 涨日均量/跌日均量=${udRatio.toFixed(2)}>1.5 → ${s}+1`);
      } else if (udRatio < 0.67) {
        const s = (isNum(ma20) && close < ma20) ? "winter" : "autumn";
        addScore(volumeRaw, s, 1);
        notes.push(`量: 涨日均量/跌日均量=${udRatio.toFixed(2)}<0.67 → ${s}+1`);
      }
    }
  }

  // OBV 背离（1分）
  if (ctx.obvRaw.length >= 20) {
    const recentObv = ctx.obvRaw.slice(-20);
    const recentClose = dailyBars.slice(-20).map(b => b.close);
    const obvMin = Math.min(...recentObv);
    const obvMax = Math.max(...recentObv);
    const closeMin = Math.min(...recentClose);
    const closeMax = Math.max(...recentClose);
    const closeRange = closeMax - closeMin;
    const obvRange = obvMax - obvMin;
    if (closeRange > 0 && obvRange > 0) {
      const closePct = (close - closeMin) / closeRange;
      const obvCurrVal = recentObv[recentObv.length - 1];
      const obvPct = (obvCurrVal - obvMin) / obvRange;
      if (closePct <= 0.2 && obvPct >= 0.6) {
        addScore(volumeRaw, "spring", 1);
        notes.push("量: 正背离(价低位OBV高位=底部吸筹) → spring+1");
      } else if (closePct >= 0.8 && obvPct <= 0.4) {
        addScore(volumeRaw, "autumn", 1);
        notes.push("量: 负背离(价高位OBV低位=顶部派发) → autumn+1");
      }
    }
  }

  // ==========================================
  // 分组封顶 + 合计
  // ==========================================
  const trend = capScores(trendRaw, 6);
  const turn = capScores(turnRaw, 6);
  const extension = capScores(extensionRaw, 3);
  const weekly = capScores(weeklyRaw, 3);
  const volume = capScores(volumeRaw, 4);
  const totalScores = sumScores(trend, turn, extension, weekly, volume);

  // ==========================================
  // 春/秋硬门控 — V2 压制逻辑
  // ==========================================
  const springEligible = signals.upTurnCount >= 2 && totalScores.spring >= 5;
  const autumnEligible = signals.downTurnCount >= 2 && totalScores.autumn >= 5;

  const validScores: Record<PureStage, number> = cloneScores(totalScores);

  // V2: 压制到亚军分（不再设为 -Infinity）
  const sortedOriginal = topNStages(totalScores, 4);
  const maxOriginalScore = sortedOriginal[0]?.[1] ?? 0;
  const runnerUpOriginalScore = sortedOriginal[1]?.[1] ?? 0;

  if (!springEligible) {
    if (totalScores.spring === maxOriginalScore && totalScores.spring > runnerUpOriginalScore) {
      validScores.spring = runnerUpOriginalScore;
      notes.push(`春季门控: spring分(${totalScores.spring})降至亚军分(${runnerUpOriginalScore})`);
    }
  }
  if (!autumnEligible) {
    if (totalScores.autumn === maxOriginalScore && totalScores.autumn > runnerUpOriginalScore) {
      validScores.autumn = runnerUpOriginalScore;
      notes.push(`秋季门控: autumn分(${totalScores.autumn})降至亚军分(${runnerUpOriginalScore})`);
    }
  }

  // 选出最高分季节
  const validTop2 = topNStages(validScores, 2);
  const topStage = validTop2[0]?.[0] ?? "winter";
  const top1Score = validTop2[0]?.[1] ?? 0;
  const top2Score = validTop2[1]?.[1] ?? 0;

  const quantStage: Stage = topStage;

  // ==========================================
  // Confidence — V2 公式
  // ==========================================
  const scoreStrength = Math.min(top1Score / 10, 1);
  const scoreSeparation = top1Score > 0 ? (top1Score - top2Score) / top1Score : 0;
  const confidence = round2(0.5 * scoreStrength + 0.5 * scoreSeparation);

  const confidenceLevel: ConfidenceLevel =
    confidence >= 0.75 ? "high" : confidence >= 0.55 ? "medium" : "low";

  const lowEvidence = top1Score < 5 || top1Score - top2Score < 2;

  // Season Score
  const seasonScore = calcSeasonScore(totalScores);

  // AI candidates
  const aiCandidates = buildAICandidates(currentStage, validTop2);
  const needsAI =
    (top1Score - top2Score <= 2) ||
    confidenceLevel === "low" ||
    weeklyDailyConflict;

  const mediumTermAnalysis = computeMediumTermAnalysis(
    dailyBars,
    indicators.ma60,
    quantStage,
    weeklyBullish,
  );

  return {
    stage: quantStage,
    quantStage,
    finalStage: quantStage,
    confidence,
    confidenceLevel,
    seasonScore,
    scores: cloneScores(totalScores),
    scoreBreakdown: { trend, turn, extension, weekly, volume },
    turnSignals: signals,
    flags: {
      bullAlignment, bearAlignment,
      weeklyBullish, weeklyBearish,
      dailyBullStrong, dailyBearStrong,
      weeklyDailyConflict,
      springEligible, autumnEligible, lowEvidence,
    },
    notes,
    aiCandidates,
    needsAI,
    indicators,
    mediumTermAnalysis,
  };
}

function buildAICandidates(
  currentStage: Stage,
  top2: [PureStage, number][]
): PureStage[] {
  const set = new Set<PureStage>();
  if (currentStage !== "unknown") set.add(currentStage as PureStage);
  for (const [stage] of top2) set.add(stage);
  return Array.from(set);
}

// =============================================
// 状态机 + 2日确认 (V2 §10)
// =============================================

const CYCLE: PureStage[] = ["winter", "spring", "summer", "autumn"];

function getNextStage(stage: PureStage): PureStage {
  const idx = CYCLE.indexOf(stage);
  return CYCLE[(idx + 1) % CYCLE.length];
}

function isAdjacentForward(current: PureStage, target: PureStage): boolean {
  return getNextStage(current) === target;
}

function downgradeToAdjacent(current: PureStage): PureStage {
  return getNextStage(current);
}

export function updatePersistenceState(params: {
  state: PersistenceState;
  predictedStage: PureStage;
  top1MinusTop2: number;
  weeklyAligned: boolean;
}): PersistenceUpdateResult {
  const { state, predictedStage, top1MinusTop2, weeklyAligned } = params;

  let effectivePredictedStage = predictedStage;
  let reason = "";

  if (predictedStage === state.currentStage) {
    return {
      state: { currentStage: state.currentStage, pendingStage: null, pendingCount: 0 },
      switched: false,
      effectivePredictedStage,
      originalPredictedStage: predictedStage,
      reason: "预测阶段与当前阶段一致，清空待确认状态",
    };
  }

  if (!isAdjacentForward(state.currentStage, predictedStage)) {
    effectivePredictedStage = downgradeToAdjacent(state.currentStage);
    reason = `非相邻跳转(${state.currentStage}->${predictedStage})，降级为相邻过渡阶段 ${effectivePredictedStage}`;
  } else {
    reason = `相邻跳转(${state.currentStage}->${predictedStage})，进入确认流程`;
  }

  let nextPendingStage = state.pendingStage;
  let nextPendingCount = state.pendingCount;

  if (effectivePredictedStage === nextPendingStage) {
    nextPendingCount += 1;
  } else {
    nextPendingStage = effectivePredictedStage;
    nextPendingCount = 1;
  }

  const requiredDays = (top1MinusTop2 >= 5 && weeklyAligned) ? 1 : 2;

  if (nextPendingCount >= requiredDays) {
    return {
      state: { currentStage: effectivePredictedStage, pendingStage: null, pendingCount: 0 },
      switched: true,
      effectivePredictedStage,
      originalPredictedStage: predictedStage,
      reason: reason + ` → 确认达${requiredDays}日，切换至 ${effectivePredictedStage}`,
    };
  }

  return {
    state: { currentStage: state.currentStage, pendingStage: nextPendingStage, pendingCount: nextPendingCount },
    switched: false,
    effectivePredictedStage,
    originalPredictedStage: predictedStage,
    reason: reason + ` → 待确认${nextPendingCount}/${requiredDays}日`,
  };
}
