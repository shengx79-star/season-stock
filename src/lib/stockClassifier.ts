/* eslint-disable @typescript-eslint/no-non-null-assertion */

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
}

export interface TurnSignals {
  ma514Golden: boolean;
  ma514Dead: boolean;
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
  upStreak: number;
  downStreak: number;
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

export interface ClassificationResult {
  stage: Stage;
  quantStage: Stage;
  finalStage: Stage;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  scores: StageScores;
  scoreBreakdown: ScoreBreakdown;
  turnSignals: TurnSignals;
  flags: ClassificationFlags;
  notes: string[];
  aiCandidates: PureStage[];
  needsAI: boolean;
  indicators: IndicatorSnapshot;
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

const STAGES: PureStage[] = ["winter", "spring", "summer", "autumn"];

function emptyScores(): StageScores {
  return { winter: 0, spring: 0, summer: 0, autumn: 0 };
}

function cloneScores(s: StageScores): StageScores {
  return { ...s };
}

function round(num: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
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

function topNStages(scores: Partial<Record<PureStage, number>>, n = 2): [PureStage, number][] {
  return (Object.entries(scores) as [PureStage, number][])
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// -----------------------------
// 基础指标
// -----------------------------

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
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): {
  dif: Array<number | null>;
  dea: Array<number | null>;
  hist: Array<number | null>;
} {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);

  const dif: Array<number | null> = values.map((_, i) =>
    isNum(fastEma[i]) && isNum(slowEma[i]) ? fastEma[i]! - slowEma[i]! : null
  );

  const difValues = dif.map((v) => v ?? 0);
  const deaRaw = ema(difValues, signal);

  const dea: Array<number | null> = deaRaw.map((v, i) => (isNum(dif[i]) ? v : null));
  const hist: Array<number | null> = dif.map((v, i) =>
    isNum(v) && isNum(dea[i]) ? 2 * (v - dea[i]!) : null
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
): {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  percentB: Array<number | null>;
} {
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

function calcVolumeRatio5(bars: Candle[]): Array<number | null> {
  const out: Array<number | null> = Array(bars.length).fill(null);
  for (let i = 4; i < bars.length; i++) {
    const avg = bars.slice(i - 4, i + 1).reduce((acc, b) => acc + b.volume, 0) / 5;
    out[i] = avg === 0 ? null : bars[i].volume / avg;
  }
  return out;
}

function calcStreaks(close: number[]): { upStreak: number; downStreak: number } {
  let upStreak = 0;
  let downStreak = 0;

  for (let i = close.length - 1; i > 0; i--) {
    if (close[i] > close[i - 1] && downStreak === 0) upStreak++;
    else if (close[i] < close[i - 1] && upStreak === 0) downStreak++;
    else break;
  }

  return { upStreak, downStreak };
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

// -----------------------------
// 信号检测
// -----------------------------

function crossedAboveWithin(
  a: Array<number | null>,
  b: Array<number | null>,
  lookback: number
): boolean {
  const start = Math.max(1, a.length - lookback);
  for (let i = start; i < a.length; i++) {
    if (
      isNum(a[i - 1]) &&
      isNum(b[i - 1]) &&
      isNum(a[i]) &&
      isNum(b[i]) &&
      a[i - 1]! <= b[i - 1]! &&
      a[i]! > b[i]!
    ) {
      return true;
    }
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
      isNum(a[i - 1]) &&
      isNum(b[i - 1]) &&
      isNum(a[i]) &&
      isNum(b[i]) &&
      a[i - 1]! >= b[i - 1]! &&
      a[i]! < b[i]!
    ) {
      return true;
    }
  }
  return false;
}

function movedAboveThresholdWithin(
  series: Array<number | null>,
  threshold: number,
  lookback: number
): boolean {
  const start = Math.max(1, series.length - lookback);
  for (let i = start; i < series.length; i++) {
    if (isNum(series[i - 1]) && isNum(series[i]) && series[i - 1]! < threshold && series[i]! >= threshold) {
      return true;
    }
  }
  return false;
}

function movedBelowThresholdWithin(
  series: Array<number | null>,
  threshold: number,
  lookback: number
): boolean {
  const start = Math.max(1, series.length - lookback);
  for (let i = start; i < series.length; i++) {
    if (isNum(series[i - 1]) && isNum(series[i]) && series[i - 1]! > threshold && series[i]! <= threshold) {
      return true;
    }
  }
  return false;
}

function seriesDelta(series: Array<number | null>, lookback: number): number | null {
  if (series.length <= lookback) return null;
  const curr = series[series.length - 1];
  const prev = series[series.length - 1 - lookback];
  if (!isNum(curr) || !isNum(prev)) return null;
  return curr - prev;
}

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

  const weekMA5 = sma(weekClose, 5);
  const weekMA10 = sma(weekClose, 10);
  const weekMacd = macd(weekClose, 12, 26, 9);

  return {
    close,
    ma5,
    ma10,
    ma14,
    ma20,
    ma60,
    rsi14,
    bias20,
    bias60,
    dif,
    dea,
    hist,
    k,
    d,
    j,
    bollMid: mid,
    bollUpper: upper,
    bollLower: lower,
    percentB,
    ma20Slope5,
    volumeRatio5,
    weekClose,
    weekMA5,
    weekMA10,
    weekDif: weekMacd.dif,
    weekDea: weekMacd.dea,
    weekHist: weekMacd.hist,
  };
}

function computeTurnSignals(ctx: ReturnType<typeof buildIndicatorContext>): TurnSignals {
  const ma514Golden = crossedAboveWithin(ctx.ma5, ctx.ma14, 5);
  const ma514Dead = crossedBelowWithin(ctx.ma5, ctx.ma14, 5);

  const macdGolden = crossedAboveWithin(ctx.dif, ctx.dea, 5);
  const macdDead = crossedBelowWithin(ctx.dif, ctx.dea, 5);

  const priceReclaimMA20 = crossedAboveWithin(
    ctx.close.map((v) => v),
    ctx.ma20,
    5
  );

  const priceLoseMA20 = crossedBelowWithin(
    ctx.close.map((v) => v),
    ctx.ma20,
    5
  );

  const rsiDelta5 = seriesDelta(ctx.rsi14, 5);
  const rsi5Ago = ctx.rsi14.length > 5 ? ctx.rsi14[ctx.rsi14.length - 6] : null;
  const rsiNow = last(ctx.rsi14) ?? null;

  const rsiLowRecovery =
    (isNum(rsi5Ago) && isNum(rsiNow) && rsi5Ago < 35 && rsiNow > 35) ||
    (isNum(rsiDelta5) && rsiDelta5 >= 5);

  const rsiHighDrop =
    (isNum(rsi5Ago) && isNum(rsiNow) && rsi5Ago > 65 && rsiNow < 65) ||
    (isNum(rsiDelta5) && rsiDelta5 <= -5);

  const kdjRecover = movedAboveThresholdWithin(ctx.j, 20, 5);
  const kdjFall = movedBelowThresholdWithin(ctx.j, 80, 5);

  const upTurnCount = [
    ma514Golden,
    macdGolden,
    priceReclaimMA20,
    rsiLowRecovery,
    kdjRecover,
  ].filter(Boolean).length;

  const downTurnCount = [
    ma514Dead,
    macdDead,
    priceLoseMA20,
    rsiHighDrop,
    kdjFall,
  ].filter(Boolean).length;

  return {
    ma514Golden,
    ma514Dead,
    macdGolden,
    macdDead,
    priceReclaimMA20,
    priceLoseMA20,
    rsiLowRecovery,
    rsiHighDrop,
    kdjRecover,
    kdjFall,
    upTurnCount,
    downTurnCount,
  };
}

function latestSnapshot(
  dailyBars: Candle[],
  weeklyBars: Candle[],
  ctx: ReturnType<typeof buildIndicatorContext>
): IndicatorSnapshot {
  const close = last(ctx.close)!;
  const streaks = calcStreaks(ctx.close);
  const shadows = shadowRatios(last(dailyBars)!);

  return {
    close,
    ma5: last(ctx.ma5) ?? null,
    ma10: last(ctx.ma10) ?? null,
    ma14: last(ctx.ma14) ?? null,
    ma20: last(ctx.ma20) ?? null,
    ma60: last(ctx.ma60) ?? null,
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
    upStreak: streaks.upStreak,
    downStreak: streaks.downStreak,
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

// -----------------------------
// 核心分类
// -----------------------------

export function classifyStock(input: ClassificationInput): ClassificationResult {
  const { dailyBars, weeklyBars, currentStage = "unknown" } = input;

  if (dailyBars.length < 60 || weeklyBars.length < 10) {
    return {
      stage: "unknown",
      quantStage: "unknown",
      finalStage: "unknown",
      confidence: 0,
      confidenceLevel: "low",
      scores: emptyScores(),
      scoreBreakdown: {
        trend: emptyScores(),
        turn: emptyScores(),
        extension: emptyScores(),
        weekly: emptyScores(),
      },
      turnSignals: {
        ma514Golden: false,
        ma514Dead: false,
        macdGolden: false,
        macdDead: false,
        priceReclaimMA20: false,
        priceLoseMA20: false,
        rsiLowRecovery: false,
        rsiHighDrop: false,
        kdjRecover: false,
        kdjFall: false,
        upTurnCount: 0,
        downTurnCount: 0,
      },
      flags: {
        bullAlignment: false,
        bearAlignment: false,
        weeklyBullish: false,
        weeklyBearish: false,
        dailyBullStrong: false,
        dailyBearStrong: false,
        weeklyDailyConflict: false,
        springEligible: false,
        autumnEligible: false,
        lowEvidence: true,
      },
      notes: ["数据不足：需要至少60根日线和10根周线"],
      aiCandidates: [],
      needsAI: false,
      indicators: {
        close: last(dailyBars)?.close ?? 0,
        ma5: null,
        ma10: null,
        ma14: null,
        ma20: null,
        ma60: null,
        rsi14: null,
        bias20: null,
        bias60: null,
        dif: null,
        dea: null,
        macdHist: null,
        k: null,
        d: null,
        j: null,
        bollMid: null,
        bollUpper: null,
        bollLower: null,
        percentB: null,
        ma20Slope5: null,
        volumeRatio5: null,
        upStreak: 0,
        downStreak: 0,
        dayReturnPct: null,
        upperShadowPct: null,
        lowerShadowPct: null,
        amplitudePct: null,
        weekClose: null,
        weekMA5: null,
        weekMA10: null,
        weekDif: null,
        weekDea: null,
        weekMacdHist: null,
      },
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
    ma5,
    ma10,
    ma20,
    ma60,
    rsi14,
    bias20,
    dif,
    dea,
    macdHist: hist,
    percentB,
    ma20Slope5,
    volumeRatio5,
    weekMA5,
    weekMA10,
    weekDif,
    weekDea,
    weekMacdHist: weekHistVal,
  } = indicators;

  const close = indicators.close;
  const j = indicators.j;
  const upperShadowPct = indicators.upperShadowPct;
  const lowerShadowPct = indicators.lowerShadowPct;
  const dayRet = indicators.dayReturnPct;
  const amplitude = indicators.amplitudePct;

  const bullAlignment =
    isNum(ma5) && isNum(ma10) && isNum(ma20) && isNum(ma60) &&
    ma5 > ma10 && ma10 > ma20 && ma20 > ma60;

  const bearAlignment =
    isNum(ma5) && isNum(ma10) && isNum(ma20) && isNum(ma60) &&
    ma5 < ma10 && ma10 < ma20 && ma20 < ma60;

  const weeklyBullish =
    isNum(indicators.weekClose) && isNum(weekMA5) && isNum(weekMA10) &&
    indicators.weekClose > weekMA5 && weekMA5 > weekMA10;

  const weeklyBearish =
    isNum(indicators.weekClose) && isNum(weekMA5) && isNum(weekMA10) &&
    indicators.weekClose < weekMA5 && weekMA5 < weekMA10;

  const dailyBullStrong = isNum(ma20) && isNum(ma60) && bullAlignment && close > ma20 && close > ma60;
  const dailyBearStrong = isNum(ma20) && isNum(ma60) && bearAlignment && close < ma20 && close < ma60;

  const weeklyDailyConflict =
    (dailyBullStrong && weeklyBearish) || (dailyBearStrong && weeklyBullish);

  // -----------------------------
  // 1) trend_score
  // -----------------------------
  if (bullAlignment) {
    addScore(trendRaw, "summer", 4);
    notes.push("趋势: MA5>MA10>MA20>MA60，多头排列");
  }

  if (bearAlignment) {
    addScore(trendRaw, "winter", 4);
    notes.push("趋势: MA5<MA10<MA20<MA60，空头排列");
  }

  if (isNum(ma20) && isNum(ma60)) {
    if (close > ma20 && close > ma60) {
      addScore(trendRaw, "summer", 2);
      notes.push("趋势: 价格站上MA20和MA60");
    } else if (close < ma20 && close < ma60) {
      addScore(trendRaw, "winter", 2);
      notes.push("趋势: 价格跌破MA20和MA60");
    } else if (close > ma20 && close < ma60) {
      addScore(trendRaw, "spring", 3);
      notes.push("趋势: 价格在MA20上方但MA60下方，偏春季过渡");
    } else if (close < ma20 && close > ma60) {
      addScore(trendRaw, "autumn", 3);
      notes.push("趋势: 价格在MA20下方但MA60上方，偏秋季过渡");
    }
  }

  if (isNum(ma20Slope5)) {
    if (ma20Slope5 > 1.0) {
      addScore(trendRaw, "summer", 1);
      notes.push("趋势: MA20斜率>1%，中期趋势向上");
    } else if (ma20Slope5 < -1.0) {
      addScore(trendRaw, "winter", 1);
      notes.push("趋势: MA20斜率<-1%，中期趋势向下");
    } else if (ma20Slope5 > 0 && ma20Slope5 <= 1.0 && signals.upTurnCount >= 2) {
      addScore(trendRaw, "spring", 1);
      notes.push("趋势: MA20斜率温和转正且出现转强确认");
    } else if (ma20Slope5 < 0 && ma20Slope5 >= -1.0 && signals.downTurnCount >= 2) {
      addScore(trendRaw, "autumn", 1);
      notes.push("趋势: MA20斜率温和转负且出现转弱确认");
    }
  }

  // -----------------------------
  // 2) turn_score
  // -----------------------------
  if (signals.ma514Golden) {
    addScore(turnRaw, "spring", 3);
    notes.push("转折: MA5/14 金叉");
  }
  if (signals.macdGolden) {
    addScore(turnRaw, "spring", 3);
    notes.push("转折: MACD 金叉");
  }
  if (signals.priceReclaimMA20) {
    addScore(turnRaw, "spring", 2);
    notes.push("转折: 价格重新站上MA20");
  }
  if (signals.rsiLowRecovery) {
    addScore(turnRaw, "spring", 2);
    notes.push("转折: RSI 低位回升");
  }
  if (signals.kdjRecover) {
    addScore(turnRaw, "spring", 1);
    notes.push("转折: KDJ J 从低位回到20上方");
  }

  if (signals.ma514Dead) {
    addScore(turnRaw, "autumn", 3);
    notes.push("转折: MA5/14 死叉");
  }
  if (signals.macdDead) {
    addScore(turnRaw, "autumn", 3);
    notes.push("转折: MACD 死叉");
  }
  if (signals.priceLoseMA20) {
    addScore(turnRaw, "autumn", 2);
    notes.push("转折: 价格跌破MA20");
  }
  if (signals.rsiHighDrop) {
    addScore(turnRaw, "autumn", 2);
    notes.push("转折: RSI 高位回落");
  }
  if (signals.kdjFall) {
    addScore(turnRaw, "autumn", 1);
    notes.push("转折: KDJ J 从高位跌回80下方");
  }

  // -----------------------------
  // 3) extension_score
  // -----------------------------
  if (isNum(percentB)) {
    if (percentB <= 20) {
      if (signals.upTurnCount >= 2) {
        addScore(extensionRaw, "spring", 1);
        notes.push("扩展: %B<=20 且已出现转强，更偏春季");
      } else {
        addScore(extensionRaw, "winter", 2);
        notes.push("扩展: %B<=20，偏冬季低位弱势");
      }
    } else if (percentB >= 80) {
      if (signals.downTurnCount >= 2) {
        addScore(extensionRaw, "autumn", 2);
        notes.push("扩展: %B>=80 且已出现转弱，更偏秋季");
      } else {
        addScore(extensionRaw, "summer", 1);
        notes.push("扩展: %B>=80 但未见明确转弱，仍偏强势夏季");
      }
    }
  }

  if (isNum(rsi14)) {
    if (rsi14 < 30) {
      if (signals.upTurnCount >= 2) {
        addScore(extensionRaw, "spring", 1);
        notes.push("扩展: RSI<30 且转强，偏春季");
      } else {
        addScore(extensionRaw, "winter", 1);
        notes.push("扩展: RSI<30，偏冬季");
      }
    } else if (rsi14 > 70) {
      if (signals.downTurnCount >= 2) {
        addScore(extensionRaw, "autumn", 1);
        notes.push("扩展: RSI>70 且转弱，偏秋季");
      } else {
        addScore(extensionRaw, "summer", 1);
        notes.push("扩展: RSI>70 但未转弱，仍偏夏季强势");
      }
    }
  }

  if (isNum(bias20)) {
    if (bias20 < -8) {
      if (signals.upTurnCount >= 2) {
        addScore(extensionRaw, "spring", 1);
        notes.push("扩展: BIAS20<-8% 且转强，偏春季");
      } else {
        addScore(extensionRaw, "winter", 1);
        notes.push("扩展: BIAS20<-8%，偏冬季");
      }
    } else if (bias20 > 8) {
      if (signals.downTurnCount >= 2) {
        addScore(extensionRaw, "autumn", 1);
        notes.push("扩展: BIAS20>8% 且转弱，偏秋季");
      } else {
        addScore(extensionRaw, "summer", 1);
        notes.push("扩展: BIAS20>8% 但未转弱，仍偏夏季");
      }
    }
  }

  if (isNum(lowerShadowPct) && lowerShadowPct >= 40) {
    addScore(extensionRaw, "spring", 1);
    notes.push("扩展: 下影线>=40%，有承接");
  }
  if (isNum(upperShadowPct) && upperShadowPct >= 40) {
    addScore(extensionRaw, "autumn", 1);
    notes.push("扩展: 上影线>=40%，抛压较重");
  }

  if (isNum(volumeRatio5) && isNum(dayRet)) {
    if (volumeRatio5 > 2 && dayRet > 2) {
      addScore(extensionRaw, "summer", 1);
      notes.push("扩展: 放量上涨");
    }
    if (volumeRatio5 > 2 && isNum(amplitude) && amplitude > 4 && signals.downTurnCount >= 1) {
      addScore(extensionRaw, "autumn", 1);
      notes.push("扩展: 放量大振幅且出现转弱迹象");
    }
  }

  if (indicators.downStreak >= 5) {
    addScore(extensionRaw, "winter", 1);
    notes.push("扩展: 连跌>=5天");
  }
  if (indicators.upStreak >= 5) {
    addScore(extensionRaw, "summer", 1);
    notes.push("扩展: 连涨>=5天");
  }

  // -----------------------------
  // 4) weekly_score
  // -----------------------------
  if (weeklyBullish) {
    addScore(weeklyRaw, "summer", 2);
    notes.push("周线: 收盘>周MA5>周MA10");
  }
  if (weeklyBearish) {
    addScore(weeklyRaw, "winter", 2);
    notes.push("周线: 收盘<周MA5<周MA10");
  }

  if (crossedAboveWithin(ctx.weekDif, ctx.weekDea, 3)) {
    addScore(weeklyRaw, "spring", 2);
    notes.push("周线: MACD 近3周金叉");
  }
  if (crossedBelowWithin(ctx.weekDif, ctx.weekDea, 3)) {
    addScore(weeklyRaw, "autumn", 2);
    notes.push("周线: MACD 近3周死叉");
  }

  if (
    isNum(indicators.weekMacdHist) &&
    ctx.weekHist.length >= 3 &&
    isNum(ctx.weekHist[ctx.weekHist.length - 2]) &&
    isNum(ctx.weekHist[ctx.weekHist.length - 3]) &&
    indicators.weekMacdHist > 0 &&
    indicators.weekMacdHist > ctx.weekHist[ctx.weekHist.length - 2]! &&
    ctx.weekHist[ctx.weekHist.length - 2]! > ctx.weekHist[ctx.weekHist.length - 3]!
  ) {
    addScore(weeklyRaw, "summer", 1);
    notes.push("周线: MACD 柱连续2周扩张");
  }

  if (
    isNum(indicators.weekMacdHist) &&
    ctx.weekHist.length >= 3 &&
    isNum(ctx.weekHist[ctx.weekHist.length - 2]) &&
    isNum(ctx.weekHist[ctx.weekHist.length - 3]) &&
    indicators.weekMacdHist < 0 &&
    indicators.weekMacdHist < ctx.weekHist[ctx.weekHist.length - 2]! &&
    ctx.weekHist[ctx.weekHist.length - 2]! < ctx.weekHist[ctx.weekHist.length - 3]!
  ) {
    addScore(weeklyRaw, "winter", 1);
    notes.push("周线: MACD 柱连续2周走弱");
  }

  // 分组封顶
  const trend = capScores(trendRaw, 6);
  const turn = capScores(turnRaw, 6);
  const extension = capScores(extensionRaw, 3);
  const weekly = capScores(weeklyRaw, 3);

  const totalScores = sumScores(trend, turn, extension, weekly);

  // 春/秋硬门槛
  const springEligible = signals.upTurnCount >= 2 && totalScores.spring >= 5;
  const autumnEligible = signals.downTurnCount >= 2 && totalScores.autumn >= 5;

  const validScores: Partial<Record<PureStage, number>> = {
    winter: totalScores.winter,
    summer: totalScores.summer,
    spring: springEligible ? totalScores.spring : Number.NEGATIVE_INFINITY,
    autumn: autumnEligible ? totalScores.autumn : Number.NEGATIVE_INFINITY,
  };

  let quantStage = resolveTopStage(validScores, currentStage, dailyBullStrong, dailyBearStrong);

  // 强趋势优先：除非对向转折显著更高
  if (
    dailyBullStrong &&
    quantStage === "autumn" &&
    autumnEligible &&
    totalScores.autumn - totalScores.summer < 3
  ) {
    quantStage = "summer";
    notes.push("强趋势优先: 多头结构完整，秋季未显著胜出，维持夏季");
  }

  if (
    dailyBearStrong &&
    quantStage === "spring" &&
    springEligible &&
    totalScores.spring - totalScores.winter < 3
  ) {
    quantStage = "winter";
    notes.push("强趋势优先: 空头结构完整，春季未显著胜出，维持冬季");
  }

  const validTop2 = topNStages(validScores, 2);
  const top1Score = validTop2[0]?.[1] ?? 0;
  const top2Score = validTop2[1]?.[1] ?? 0;
  const scoreStrength = Math.min(top1Score / 10, 1);
  const scoreSeparation = (top1Score - top2Score) / Math.max(top1Score, 1);
  const confidence = round(0.5 * scoreStrength + 0.5 * scoreSeparation, 4);

  const confidenceLevel: ConfidenceLevel =
    confidence >= 0.75 ? "high" : confidence >= 0.55 ? "medium" : "low";

  const lowEvidence = top1Score < 5 || top1Score - top2Score < 2;

  const aiCandidates = buildAICandidates(currentStage, validTop2);
  const needsAI =
    (top1Score - top2Score <= 2) ||
    confidenceLevel === "low" ||
    weeklyDailyConflict ||
    (
      (quantStage === "spring" && currentStage !== "unknown" && currentStage !== "spring" && springEligible) ||
      (quantStage === "autumn" && currentStage !== "unknown" && currentStage !== "autumn" && autumnEligible)
    );

  return {
    stage: quantStage,
    quantStage,
    finalStage: quantStage,
    confidence,
    confidenceLevel,
    scores: cloneScores(totalScores),
    scoreBreakdown: {
      trend,
      turn,
      extension,
      weekly,
    },
    turnSignals: signals,
    flags: {
      bullAlignment,
      bearAlignment,
      weeklyBullish,
      weeklyBearish,
      dailyBullStrong,
      dailyBearStrong,
      weeklyDailyConflict,
      springEligible,
      autumnEligible,
      lowEvidence,
    },
    notes,
    aiCandidates,
    needsAI,
    indicators,
  };
}

function resolveTopStage(
  validScores: Partial<Record<PureStage, number>>,
  currentStage: Stage,
  strongSummerBias: boolean,
  strongWinterBias: boolean
): PureStage {
  const entries = (Object.entries(validScores) as [PureStage, number][])
    .filter(([, v]) => Number.isFinite(v))
    .sort((a, b) => b[1] - a[1]);

  const maxScore = entries[0][1];
  const tied = entries.filter(([, v]) => v === maxScore).map(([stage]) => stage);

  if (tied.length === 1) return tied[0];

  if (strongSummerBias && tied.includes("summer")) return "summer";
  if (strongWinterBias && tied.includes("winter")) return "winter";

  if (currentStage !== "unknown" && tied.includes(currentStage as PureStage)) {
    return currentStage as PureStage;
  }

  if (currentStage !== "unknown") {
    const next = getNextStage(currentStage as PureStage);
    if (tied.includes(next)) return next;
  }

  const fallbackOrder: PureStage[] = ["summer", "winter", "spring", "autumn"];
  for (const s of fallbackOrder) {
    if (tied.includes(s)) return s;
  }

  return entries[0][0];
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

// -----------------------------
// 状态机 + 2日确认
// -----------------------------

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

  const sameAsCurrent = predictedStage === state.currentStage;

  if (sameAsCurrent) {
    return {
      state: {
        currentStage: state.currentStage,
        pendingStage: null,
        pendingCount: 0,
      },
      switched: false,
      effectivePredictedStage,
      originalPredictedStage: predictedStage,
      reason: "预测阶段与当前阶段一致，清空待确认状态",
    };
  }

  // 非相邻先降级为相邻过渡
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

  // 相邻过渡需要2日确认，强信号可以1日切换
  const adjacent = isAdjacentForward(state.currentStage, effectivePredictedStage);
  const requiredDays = (top1MinusTop2 >= 5 && weeklyAligned) ? 1 : 2;

  if (nextPendingCount >= requiredDays) {
    return {
      state: {
        currentStage: effectivePredictedStage,
        pendingStage: null,
        pendingCount: 0,
      },
      switched: true,
      effectivePredictedStage,
      originalPredictedStage: predictedStage,
      reason: reason + ` → 确认达${requiredDays}日，切换至 ${effectivePredictedStage}`,
    };
  }

  return {
    state: {
      currentStage: state.currentStage,
      pendingStage: nextPendingStage,
      pendingCount: nextPendingCount,
    },
    switched: false,
    effectivePredictedStage,
    originalPredictedStage: predictedStage,
    reason: reason + ` → 待确认${nextPendingCount}/${requiredDays}日`,
  };
}
