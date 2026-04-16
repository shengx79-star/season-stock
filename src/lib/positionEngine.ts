/**
 * 仓位管理引擎 v3.1 — 四层架构
 * Layer 1: 市场层 (Market Context) → 总仓位上限
 * Layer 2: 个股层 (Target Position) → 目标仓位
 * Layer 2.5: Setup 质量层 → spring先锋/确认、ATR环境刹车
 * Layer 3: 订单风险预算层 → 单笔最多可买
 * Layer 4: 执行层 (Execution Path) → 操作建议
 */

import { ClassificationResult, Candle } from "./stockClassifier";
import type { Season } from "./stockData";

// =============================================
// 类型定义
// =============================================

export type MarketRegime =
  | "severe_winter"   // 严冬
  | "healthy_bull"    // 健康多头
  | "overheated"      // 过热脆弱
  | "neutral_bull"    // 中性偏多
  | "weakening"       // 转弱市
  | "mild";           // 温和

export type ActionType =
  | "force_exit"
  | "reduce"
  | "exit_autumn"
  | "take_profit"
  | "enter"
  | "add"
  | "hold";

export type LiquidityLevel = "good" | "fair" | "poor" | "none";

export type WyckoffEvent =
  | "none"
  | "spring_test"
  | "SOS"
  | "LPS"
  | "reaccum_breakout"
  | "BC"
  | "UTAD"
  | "SOW";

export type SetupQuality = "none" | "weak" | "normal" | "strong" | "elite";

export interface PositionInput {
  symbol: string;
  name: string;
  currentPrice: number;
  positionValue: number;
  costBasis: number;
  highestCloseSinceEntry: number;
  atr20: number;
  quotaValue: number | null;
  industry: string;
  themeCluster: string;
  liquidityLevel: LiquidityLevel;
  wyckoffEvent?: WyckoffEvent;
  setupScore?: number;    // 0-5；未提供时由 quantConfidence 自动映射
  adv20Value?: number;    // 20日平均成交额（元），用于流动性上限
  atrEnvFactor?: number;  // ATR环境刹车系数，未提供时从dailyBars计算
}

export interface MarketContext {
  winterShare: number;
  springShare: number;
  summerShare: number;
  autumnShare: number;
  strength: number;
  fragility: number;
  riskOff: number;
  regime: MarketRegime;
  portfolioCap: number;
  temperature: number;
}

export interface StockPositionResult {
  symbol: string;
  name: string;
  stage: Season | "unknown";
  quantConfidence: number;
  effectiveQuota: number;
  stageCoeff: number;
  confidenceCoeff: number;
  volatilityFactor: number;
  conflictFactor: number;
  liquidityFactor: number;
  rawTargetValue: number;
  finalTargetValue: number;
  currentPositionValue: number;
  positionGap: number;
  action: ActionType;
  actionPriority: number;
  notes: string[];
  // Risk control
  hardStopPct: number | null;
  trailingStopPct: number | null;
  costBasis: number;
  currentPrice: number;
  pnlPct: number;
  // v3.1: setup 质量层
  setupScore: number;
  wyckoffEvent: WyckoffEvent;
  springEntryPhase: "pilot" | "confirmed" | null;
  springReleaseCap: number;
  executableTargetValue: number;
  // v3.1: 风险预算层
  atr20: number;
  atrEnvFactor: number;
  drawdownFactor: number;
  riskBudgetValue: number;
  riskCappedValue: number;
  liquidityCappedValue: number;
  allowedEntryValue: number;
  // v3.2: 集中度约束
  trendBucketValue: number;      // v3.3: max(0, currentValue - coreTarget) — summer trend float
  industry: string;
  themeCluster: string;
  concentrationConstraint: {
    industryGroup: string;
    industryScale: number;
    themeGroup: string;
    themeScale: number;
  } | null;
}

export interface PortfolioResult {
  market: MarketContext;
  positions: StockPositionResult[];
  totalPositionValue: number;
  totalTargetValue: number;
  cashRemaining: number;
  totalAssets: number;
}

// =============================================
// Layer 1: 市场层
// =============================================

const regimeLabels: Record<MarketRegime, string> = {
  severe_winter: "严冬",
  healthy_bull: "健康多头",
  overheated: "过热脆弱",
  neutral_bull: "中性偏多",
  weakening: "转弱市",
  mild: "温和",
};

export { regimeLabels };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeMarketContext(
  classifications: Map<string, ClassificationResult>
): MarketContext {
  let totalWeight = 0;
  let winterW = 0, springW = 0, summerW = 0, autumnW = 0;

  for (const [, cls] of classifications) {
    const stage = cls.finalStage !== "unknown" ? cls.finalStage : cls.stage;
    const confidence = cls.confidence;
    const weight = confidence;
    totalWeight += weight;
    if (stage === "winter") winterW += weight;
    else if (stage === "spring") springW += weight;
    else if (stage === "summer") summerW += weight;
    else if (stage === "autumn") autumnW += weight;
  }

  if (totalWeight === 0) totalWeight = 1;

  const winterShare = winterW / totalWeight;
  const springShare = springW / totalWeight;
  const summerShare = summerW / totalWeight;
  const autumnShare = autumnW / totalWeight;

  const strength = 0.5 * springShare + 1.0 * summerShare;
  const fragility = 1.0 * autumnShare;
  const riskOff = 1.0 * winterShare;

  // Market state mapping
  let regime: MarketRegime;
  let baseCap: number;

  if (riskOff > 0.5) {
    regime = "severe_winter";
    baseCap = 0.25;
  } else if (strength > 0.55 && fragility < 0.20) {
    regime = "healthy_bull";
    baseCap = 0.85;
  } else if (strength > 0.55 && fragility >= 0.25) {
    regime = "overheated";
    baseCap = 0.65;
  } else if (strength >= 0.30 && strength <= 0.55) {
    regime = "neutral_bull";
    baseCap = 0.70;
  } else if (riskOff >= 0.30 && fragility >= 0.30) {
    regime = "weakening";
    baseCap = 0.45;
  } else {
    regime = "mild";
    baseCap = 0.60;
  }

  const portfolioCap = clamp(baseCap, 0.20, 0.85);

  const temperature =
    10 * winterShare +
    40 * springShare +
    80 * summerShare +
    60 * autumnShare;

  return {
    winterShare, springShare, summerShare, autumnShare,
    strength, fragility, riskOff,
    regime, portfolioCap, temperature,
  };
}

// =============================================
// Layer 2: 个股目标仓位
// =============================================

const stageCoeffMap: Record<string, number> = {
  winter: 0.15,
  spring: 0.45,
  summer: 0.75,
  autumn: 0.00,
  unknown: 0.00,
};

function getConfidenceCoeff(quantConfidence: number): number {
  return clamp(0.35 + 0.9 * quantConfidence, 0.4, 1.0);
}

function getVolatilityFactor(atrPct: number): number {
  if (atrPct <= 0.02) return 1.0;
  if (atrPct <= 0.04) return 0.85;
  if (atrPct <= 0.06) return 0.70;
  return 0.50;
}

function getConflictFactor(weeklyDailyConflict: boolean): number {
  return weeklyDailyConflict ? 0.8 : 1.0;
}

function getLiquidityFactor(level: LiquidityLevel): number {
  switch (level) {
    case "good": return 1.0;
    case "fair": return 0.8;
    case "poor": return 0.5;
    case "none": return 0.0;
  }
}

// =============================================
// ATR 计算
// =============================================

export function computeATR20(dailyBars: Candle[]): number {
  if (dailyBars.length < 21) return 0;
  const bars = dailyBars.slice(-21);
  let sum = 0;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    sum += tr;
  }
  return sum / 20;
}

// =============================================
// v3.1: ATR 环境刹车 & ADV20
// =============================================

/**
 * 计算 ATR 环境系数。
 * 用近 10 条 TR 均值 / 更早 TR 均值 判断当前波动是否异常放大。
 * 无需外部 ATR Median 数据，用现有 35 条 bar 近似。
 */
export function computeATREnvFactor(dailyBars: Candle[]): number {
  if (dailyBars.length < 15) return 1.0;
  const trs: number[] = [];
  for (let i = 1; i < dailyBars.length; i++) {
    const tr = Math.max(
      dailyBars[i].high - dailyBars[i].low,
      Math.abs(dailyBars[i].high - dailyBars[i - 1].close),
      Math.abs(dailyBars[i].low - dailyBars[i - 1].close),
    );
    trs.push(tr);
  }
  const recent = trs.slice(-10);
  const historical = trs.slice(0, -10);
  if (historical.length === 0) return 1.0;
  const recentAvg    = recent.reduce((s, v) => s + v, 0) / recent.length;
  const historicalAvg = historical.reduce((s, v) => s + v, 0) / historical.length;
  if (historicalAvg === 0) return 1.0;
  const ratio = recentAvg / historicalAvg;
  if (ratio <= 1.0) return 1.0;
  if (ratio <= 1.3) return 0.85;
  return 0.65;
}

/**
 * 计算 20 日平均成交额（元）= avg(close × volume) over last 20 bars。
 */
export function computeADV20Value(dailyBars: Candle[]): number {
  if (dailyBars.length < 20) return 0;
  const bars = dailyBars.slice(-20);
  const total = bars.reduce((sum, b) => sum + b.close * b.volume, 0);
  return total / 20;
}

// =============================================
// v3.1: 风险预算层
// =============================================

/** 将 confidence(0-1) 映射为 setupScore(1-5) */
function setupScoreFromConfidence(confidence: number): number {
  if (confidence < 0.50) return 1;
  if (confidence < 0.65) return 2;
  if (confidence < 0.75) return 3;
  if (confidence < 0.85) return 4;
  return 5;
}

/**
 * Spring 先锋仓 / 确认仓判定。
 * - confirmed：setup 评分 ≥ 3 且无周日冲突，且 (upTurnCount ≥ 2 或已有浮盈)
 * - pilot：其余 spring 场景
 */
function computeSpringEntryPhase(
  stage: string,
  effectiveSetupScore: number,
  upTurnCount: number,
  pnlPct: number,       // 百分比，如 5.0 = +5%
  weeklyDailyConflict: boolean,
): "pilot" | "confirmed" | null {
  if (stage !== "spring") return null;
  if (
    effectiveSetupScore >= 3 &&
    !weeklyDailyConflict &&
    (upTurnCount >= 2 || pnlPct > 0)
  ) {
    return "confirmed";
  }
  return "pilot";
}

/** 流动性上限：ADV20 × 参与率 */
function computeLiquidityCappedValue(adv20Value: number, level: LiquidityLevel): number {
  const participationRate: Record<LiquidityLevel, number> = {
    good: 0.02,
    fair: 0.01,
    poor: 0.005,
    none: 0.0,
  };
  return adv20Value * participationRate[level];
}

/**
 * 计算本笔交易的风险预算金额。
 * = totalAssets × baseRiskPct × regimeFactor × atrEnvFactor × drawdownFactor × setupFactor
 * 数值参考 v3.1 规范。
 */
function computeRiskBudget(
  totalAssets: number,
  regime: MarketRegime,
  effectiveSetupScore: number,
  drawdownPct: number,
  atrEnvFactor: number,
): number {
  // P0: 按文档校正的 baseRiskPct
  const baseRiskPctMap: Record<MarketRegime, number> = {
    healthy_bull:  0.008,   // 0.80%
    neutral_bull:  0.006,   // 0.60%
    mild:          0.005,   // 0.50%
    overheated:    0.0045,  // 0.45%
    weakening:     0.0035,  // 0.35%
    severe_winter: 0.002,   // 0.20%
  };
  // P0: 按文档校正的 regimeFactor
  const regimeFactorMap: Record<MarketRegime, number> = {
    healthy_bull:  1.0,
    neutral_bull:  0.9,
    mild:          0.8,
    overheated:    0.7,
    weakening:     0.5,
    severe_winter: 0.3,
  };

  // setupScore ≤ 1 → 不允许开新仓（factor=0）
  const setupFactorMap: Record<number, number> = { 0: 0, 1: 0, 2: 0.7, 3: 1.0, 4: 1.15, 5: 1.25 };
  const setupFactor = setupFactorMap[clamp(Math.round(effectiveSetupScore), 0, 5)] ?? 1.0;

  const drawdownFactor =
    drawdownPct < 0.03 ? 1.0 :
    drawdownPct < 0.06 ? 0.75 :
    drawdownPct < 0.10 ? 0.5  : 0.25;

  return (
    totalAssets *
    baseRiskPctMap[regime] *
    regimeFactorMap[regime] *
    atrEnvFactor *
    drawdownFactor *
    setupFactor
  );
}

/**
 * 用风险预算反推可买金额。
 * perShareRisk = max(ATRMultiplier × atr20, entryPrice × minStopPct)
 * shares = floor(riskBudgetValue / perShareRisk)
 * return shares × entryPrice
 */
function computeRiskCappedValue(
  riskBudgetValue: number,
  entryPrice: number,
  atr20: number,
  stage: string,
): number {
  if (riskBudgetValue <= 0 || entryPrice <= 0) return 0;
  const atrMultiplierMap: Record<string, number> = { winter: 2.5, spring: 2.0, summer: 2.0, autumn: 0 };
  const minStopPctMap: Record<string, number>    = { winter: 0.08, spring: 0.05, summer: 0.05, autumn: 0 };
  const multiplier  = atrMultiplierMap[stage] ?? 2.0;
  const minStopPct  = minStopPctMap[stage]  ?? 0.07;
  const perShareRisk = Math.max(multiplier * atr20, entryPrice * minStopPct);
  if (perShareRisk <= 0) return 0;
  const shares = Math.floor(riskBudgetValue / perShareRisk);
  return shares * entryPrice;
}

// =============================================
// Layer 3: 执行层 + 风险控制
// =============================================

function getAction(
  stage: string,
  currentValue: number,
  targetValue: number,           // executableTargetValue（已应用 spring 释放上限）
  totalAssets: number,
  costBasis: number,
  currentPrice: number,
  highestClose: number,
  atrPct: number,
  quantConfidence: number,
  weeklyDailyConflict: boolean,
  upTurnCount: number,           // v3.1: 用于冬季入场过滤
  downTurnCount: number,         // v3.1: 用于 pending autumn 提前防守
  percentB: number | null,       // v3.1: 用于冬季入场过滤
  pnlPct: number,                // 已在外部计算（百分比，如 5.0 = +5%）
): { action: ActionType; priority: number; notes: string[] } {
  const notes: string[] = [];
  const gap = targetValue - currentValue;
  const threshold = Math.max(targetValue * 0.20, totalAssets * 0.005);

  // Risk checks: hard stop / trailing stop
  const hardStopWinter   = clamp(Math.max(0.08, 2.5 * atrPct), 0.08, 0.12);
  const hardStopSpring   = clamp(Math.max(0.05, 2.0 * atrPct), 0.05, 0.10);
  const trailingStopSummer = clamp(Math.max(0.08, 2.5 * atrPct), 0.08, 0.12);
  const pnlRatio = pnlPct / 100;

  // Force exit checks
  if (currentValue > 0 && costBasis > 0) {
    if (stage === "winter" && pnlRatio <= -hardStopWinter) {
      return { action: "force_exit", priority: 0, notes: ["❗ 冬季硬止损触发"] };
    }
    if (stage === "spring" && pnlRatio <= -hardStopSpring) {
      return { action: "force_exit", priority: 0, notes: ["❗ 春季硬止损触发"] };
    }
    if (stage === "summer" && highestClose > 0) {
      const drawdown = (highestClose - currentPrice) / highestClose;
      if (drawdown >= trailingStopSummer) {
        return { action: "take_profit", priority: 2, notes: ["📉 夏季跟踪止盈触发"] };
      }
      if (drawdown >= 0.10) {
        notes.push("⚠️ 夏季回撤超10%，建议减仓50%");
        return { action: "reduce", priority: 1, notes };
      }
    }
  }

  // P3: pending autumn 提前防守
  // 条件：非秋季但 downTurnCount >= 2，持仓超过目标的 50%
  if (stage !== "autumn" && currentValue > 0 && downTurnCount >= 2) {
    const threshold1 = totalAssets * 0.005;
    if (currentValue > targetValue + threshold1) {
      notes.push("⚠️ 转弱信号增强（downTurn≥2），提前防守减仓");
      return { action: "reduce", priority: 1, notes };
    }
  }

  // Autumn: only exit
  if (stage === "autumn") {
    if (currentValue > 0) {
      notes.push("🍂 秋季目标仓位为零，执行退出");
      return { action: "exit_autumn", priority: 2, notes };
    }
    return { action: "hold", priority: 5, notes: ["🍂 秋季，无持仓"] };
  }

  // Reduce if over target — summer uses trend bucket (trailing stop manages exit)
  if (currentValue > targetValue && Math.abs(gap) > threshold) {
    if (stage === "summer") {
      const trendPct = ((currentValue - targetValue) / targetValue * 100).toFixed(0);
      notes.push(`📈 趋势桶运行中（超配额 +${trendPct}%），跟踪止盈保护`);
      // fall through to hold — trailing stop handles the exit
    } else {
      notes.push("📊 当前仓位高于目标，需减仓");
      return { action: "reduce", priority: 1, notes };
    }
  }

  // Enter / Add
  if (gap > threshold) {
    // P2: 冬季入场过滤 — 至少满足一项才允许新建仓
    let winterOK = true;
    if (stage === "winter" && currentValue === 0) {
      winterOK =
        upTurnCount >= 1 ||
        (percentB !== null && percentB <= 20) ||
        quantConfidence >= 0.60;
      if (!winterOK) {
        notes.push("⛔ 冬季入场门槛未达（需 upTurn≥1 或 %B≤20）");
        return { action: "hold", priority: 5, notes };
      }
    }

    const canEnter = stage === "spring" || stage === "summer" ||
                     (stage === "winter" && winterOK);

    if (canEnter) {
      if (currentValue === 0) {
        notes.push("🌱 符合建仓条件");
        return { action: "enter", priority: 3, notes };
      } else {
        // v3.1: 加仓需浮盈授权（Progressive Exposure）
        if (pnlPct <= 0) {
          notes.push("⏸ 持仓亏损中，暂缓加仓（浮盈授权未达）");
          return { action: "hold", priority: 5, notes };
        }
        notes.push("📈 符合加仓条件");
        return { action: "add", priority: 4, notes };
      }
    } else {
      notes.push("⏳ 目标仓位高于当前，但未满足进攻条件");
      return { action: "hold", priority: 5, notes };
    }
  }

  // Hold
  if (currentValue > 0) {
    notes.push("✅ 仓位接近目标，继续持有");
  } else {
    notes.push("👀 观望中");
  }
  return { action: "hold", priority: 5, notes };
}

// =============================================
// 完整组合计算
// =============================================

export function computePortfolio(
  totalAssets: number,
  defaultQuotaValue: number, // 默认配额（元），无自定义时使用
  inputs: PositionInput[],
  classifications: Map<string, ClassificationResult>,
  equityPeak?: number, // v3.1: 账户历史高点，用于计算组合回撤刹车
  marketClassifications?: Map<string, ClassificationResult>, // 全量股票，用于市场层（不传时退化为 classifications）
): PortfolioResult {
  // Layer 1: 用全量股票（若有）计算市场制度，确保与 UI 展示一致
  const market = computeMarketContext(
    marketClassifications && marketClassifications.size > 0 ? marketClassifications : classifications
  );

  // v3.1: 组合回撤计算
  const peak = equityPeak && equityPeak > totalAssets ? equityPeak : totalAssets;
  const portfolioDrawdownPct = Math.max(0, (peak - totalAssets) / peak);

  // Layer 2: compute each stock's target
  const rawResults: StockPositionResult[] = [];

  for (const input of inputs) {
    const cls = classifications.get(input.symbol);
    const stage = cls
      ? (cls.finalStage !== "unknown" ? cls.finalStage : cls.stage)
      : "unknown";
    const quantConfidence = cls?.confidence ?? 0.5;
    const weeklyDailyConflict = cls?.flags?.weeklyDailyConflict ?? false;
    const upTurnCount   = cls?.turnSignals?.upTurnCount   ?? 0;
    const downTurnCount = cls?.turnSignals?.downTurnCount ?? 0;
    const percentB      = cls?.indicators?.percentB       ?? null;

    const effectiveQuota = input.quotaValue ?? defaultQuotaValue;

    const sc = stageCoeffMap[stage] ?? 0;
    const cc = getConfidenceCoeff(quantConfidence);
    const atrPct = input.currentPrice > 0 ? input.atr20 / input.currentPrice : 0;
    const vf = getVolatilityFactor(atrPct);
    const cf = getConflictFactor(weeklyDailyConflict);
    const lf = getLiquidityFactor(input.liquidityLevel);

    const rawTarget = effectiveQuota * sc * cc * vf * cf * lf;

    const pnlPct = input.costBasis > 0
      ? (input.currentPrice - input.costBasis) / input.costBasis * 100
      : 0;

    // ---- v3.1 Layer 2.5: Setup 质量 & Spring 先锋/确认仓 ----
    const wyckoffEvent: WyckoffEvent = input.wyckoffEvent ?? "none";
    const effectiveSetupScore =
      input.setupScore !== undefined
        ? input.setupScore
        : setupScoreFromConfidence(quantConfidence);

    const springEntryPhase = computeSpringEntryPhase(
      stage,
      effectiveSetupScore,
      upTurnCount,
      pnlPct,
      weeklyDailyConflict,
    );

    // P1: spring 先锋仓只释放 40%，confirmed 释放全量
    const springReleaseCap =
      springEntryPhase === "pilot"     ? rawTarget * 0.40 :
      springEntryPhase === "confirmed" ? rawTarget         : rawTarget;
    const executableTargetValue = stage === "spring"
      ? Math.min(rawTarget, springReleaseCap)
      : rawTarget;

    // ---- v3.1 Layer 3: 风险预算 ----
    const atrEnvFactor = input.atrEnvFactor ?? 1.0; // 由 Portfolio.tsx 预计算传入

    const riskBudgetValue = computeRiskBudget(
      totalAssets,
      market.regime,
      effectiveSetupScore,
      portfolioDrawdownPct,
      atrEnvFactor,
    );
    const riskCappedValue = computeRiskCappedValue(
      riskBudgetValue,
      input.currentPrice,
      input.atr20,
      stage,
    );

    // P5: 流动性上限（ADV20 × 参与率）
    const adv20 = input.adv20Value ?? 0;
    const liquidityCappedValue = adv20 > 0
      ? computeLiquidityCappedValue(adv20, input.liquidityLevel)
      : Infinity; // 无 ADV20 数据时不设流动性限制

    // drawdownFactor for display
    const drawdownFactor =
      portfolioDrawdownPct < 0.03 ? 1.0 :
      portfolioDrawdownPct < 0.06 ? 0.75 :
      portfolioDrawdownPct < 0.10 ? 0.5  : 0.25;

    // Risk thresholds
    let hardStopPct: number | null = null;
    let trailingStopPct: number | null = null;
    if (stage === "winter") hardStopPct = clamp(Math.max(0.08, 2.5 * atrPct), 0.08, 0.12) * 100;
    if (stage === "spring") hardStopPct = clamp(Math.max(0.05, 2.0 * atrPct), 0.05, 0.10) * 100;
    if (stage === "summer") trailingStopPct = clamp(Math.max(0.08, 2.5 * atrPct), 0.08, 0.12) * 100;

    const { action, priority, notes } = getAction(
      stage,
      input.positionValue,
      executableTargetValue,     // 使用 spring 释放上限后的目标
      totalAssets,
      input.costBasis,
      input.currentPrice,
      input.highestCloseSinceEntry,
      atrPct,
      quantConfidence,
      weeklyDailyConflict,
      upTurnCount,
      downTurnCount,
      percentB,
      pnlPct,
    );

    // Add context notes
    const seasonNotes: Record<string, string> = {
      winter: "❄️ 冬季：小仓试错",
      spring: "🌱 春季：启动建仓",
      summer: "☀️ 夏季：主仓持有",
      autumn: "🍂 秋季：退出管理",
    };
    if (stage !== "unknown") {
      notes.unshift(seasonNotes[stage] ?? "");
    }
    if (springEntryPhase === "pilot") {
      notes.push("🔬 spring pilot：仅释放40%目标仓位");
    } else if (springEntryPhase === "confirmed") {
      notes.push("✅ spring confirmed：允许释放全量目标仓位");
    }

    // v3.1: allowedEntryValue = min(gap, riskCapped, liquidityCapped)
    const positionGap = executableTargetValue - input.positionValue;
    const allowedEntryValue = positionGap > 0
      ? Math.min(positionGap, riskCappedValue, liquidityCappedValue)
      : 0;

    rawResults.push({
      symbol: input.symbol,
      name: input.name,
      stage: stage as Season | "unknown",
      quantConfidence,
      effectiveQuota,
      stageCoeff: sc,
      confidenceCoeff: cc,
      volatilityFactor: vf,
      conflictFactor: cf,
      liquidityFactor: lf,
      rawTargetValue: rawTarget,
      finalTargetValue: rawTarget, // will be adjusted below
      currentPositionValue: input.positionValue,
      positionGap,
      action,
      actionPriority: priority,
      notes,
      hardStopPct,
      trailingStopPct,
      costBasis: input.costBasis,
      currentPrice: input.currentPrice,
      pnlPct,
      // v3.1 setup 质量层
      setupScore: effectiveSetupScore,
      wyckoffEvent,
      springEntryPhase,
      springReleaseCap,
      executableTargetValue,
      // v3.1 风险预算层
      atr20: input.atr20,
      atrEnvFactor,
      drawdownFactor,
      riskBudgetValue,
      riskCappedValue,
      liquidityCappedValue: liquidityCappedValue === Infinity ? 0 : liquidityCappedValue,
      allowedEntryValue,
      // v3.2: 集中度约束（在 Layer 2.95 填充）
      trendBucketValue: Math.max(0, input.positionValue - executableTargetValue),
      industry: input.industry,
      themeCluster: input.themeCluster,
      concentrationConstraint: null,
    });
  }

  // Layer 2.9: Portfolio-level scaling
  const rawPortfolioTarget = rawResults.reduce((sum, r) => sum + r.rawTargetValue, 0);
  const capValue = market.portfolioCap * totalAssets;

  if (rawPortfolioTarget > capValue && rawPortfolioTarget > 0) {
    const scale = capValue / rawPortfolioTarget;
    for (const r of rawResults) {
      r.finalTargetValue = r.rawTargetValue * scale;
      // spring: executable 同步缩放
      r.executableTargetValue = r.executableTargetValue * scale;
      r.springReleaseCap = r.springReleaseCap * scale;
      r.positionGap = r.executableTargetValue - r.currentPositionValue;
      // v3.1: 重新计算缩放后的 allowedEntryValue
      const liquidityCap = r.liquidityCappedValue > 0 ? r.liquidityCappedValue : Infinity;
      r.allowedEntryValue = r.positionGap > 0
        ? Math.min(r.positionGap, r.riskCappedValue, liquidityCap)
        : 0;
    }
  }

  // ── Layer 2.95: 集中度约束（先行业后主题）──
  if (totalAssets > 0) {
    const INDUSTRY_CAP = totalAssets * 0.25;
    const THEME_CAP    = totalAssets * 0.20;

    function applyConcentrationCap(
      group: StockPositionResult[],
      cap: number,
      type: "industry" | "theme",
      groupName: string,
    ) {
      const total = group.reduce((s, r) => s + r.finalTargetValue, 0);
      if (total <= cap || total === 0) return;
      const scale = cap / total;
      for (const r of group) {
        r.finalTargetValue      *= scale;
        r.executableTargetValue *= scale;
        r.springReleaseCap      *= scale;
        r.positionGap            = r.executableTargetValue - r.currentPositionValue;
        const liqCap = r.liquidityCappedValue > 0 ? r.liquidityCappedValue : Infinity;
        r.allowedEntryValue = r.positionGap > 0
          ? Math.min(r.positionGap, r.riskCappedValue, liqCap) : 0;
        r.concentrationConstraint = r.concentrationConstraint ?? {
          industryGroup: "", industryScale: 1.0,
          themeGroup: "", themeScale: 1.0,
        };
        if (type === "industry") {
          r.concentrationConstraint.industryGroup = groupName;
          r.concentrationConstraint.industryScale = scale;
          r.notes.push(`行业集中度约束：${groupName} 超过25%，压缩×${scale.toFixed(2)}`);
        } else {
          r.concentrationConstraint.themeGroup = groupName;
          r.concentrationConstraint.themeScale = scale;
          r.notes.push(`主题集中度约束：${groupName} 超过20%，压缩×${scale.toFixed(2)}`);
        }
      }
    }

    // Step A：按行业分组压缩
    const byIndustry = new Map<string, StockPositionResult[]>();
    for (const r of rawResults) {
      if (!r.industry) continue;
      const g = byIndustry.get(r.industry) ?? [];
      g.push(r);
      byIndustry.set(r.industry, g);
    }
    for (const [name, group] of byIndustry) {
      applyConcentrationCap(group, INDUSTRY_CAP, "industry", name);
    }

    // Step B：按主题分组压缩（空字符串跳过）
    const byTheme = new Map<string, StockPositionResult[]>();
    for (const r of rawResults) {
      if (!r.themeCluster) continue;
      const g = byTheme.get(r.themeCluster) ?? [];
      g.push(r);
      byTheme.set(r.themeCluster, g);
    }
    for (const [name, group] of byTheme) {
      applyConcentrationCap(group, THEME_CAP, "theme", name);
    }
  }

  // Sort by action priority
  rawResults.sort((a, b) => a.actionPriority - b.actionPriority);

  const totalPositionValue = rawResults.reduce((sum, r) => sum + r.currentPositionValue, 0);
  const totalTargetValue = rawResults.reduce((sum, r) => sum + r.finalTargetValue, 0);

  return {
    market,
    positions: rawResults,
    totalPositionValue,
    totalTargetValue,
    cashRemaining: totalAssets - totalPositionValue,
    totalAssets,
  };
}
