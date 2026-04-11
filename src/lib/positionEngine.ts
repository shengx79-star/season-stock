/**
 * 仓位管理引擎 v3 — 三层架构
 * Layer 1: 市场层 (Market Context) → 总仓位上限
 * Layer 2: 个股层 (Target Position) → 目标仓位
 * Layer 3: 执行层 (Execution Path) → 操作建议
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
  setupScore?: number; // 0-5；未提供时由 quantConfidence 自动映射
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
  // v3.1: risk budget layer
  setupScore: number;
  wyckoffEvent: WyckoffEvent;
  drawdownFactor: number;
  riskBudgetValue: number;
  riskCappedValue: number;
  allowedEntryValue: number;
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
 * 计算本笔交易的风险预算金额。
 * = totalAssets × baseRiskPct × regimeFactor × setupFactor × drawdownFactor
 */
function computeRiskBudget(
  totalAssets: number,
  regime: MarketRegime,
  effectiveSetupScore: number,
  drawdownPct: number,
): number {
  const baseRiskPctMap: Record<MarketRegime, number> = {
    healthy_bull:  0.010,
    neutral_bull:  0.0075,
    mild:          0.0065,
    overheated:    0.005,
    weakening:     0.004,
    severe_winter: 0.002,
  };
  const regimeFactorMap: Record<MarketRegime, number> = {
    healthy_bull:  1.0,
    neutral_bull:  0.8,
    mild:          0.8,
    overheated:    0.7,
    weakening:     0.5,
    severe_winter: 0.3,
  };

  // setupScore ≤ 1 → 不允许开新仓（factor=0）
  const setupFactorMap: Record<number, number> = { 0: 0, 1: 0, 2: 0.7, 3: 1.0, 4: 1.2, 5: 1.3 };
  const setupFactor = setupFactorMap[clamp(Math.round(effectiveSetupScore), 0, 5)] ?? 1.0;

  const drawdownFactor =
    drawdownPct < 0.03 ? 1.0 :
    drawdownPct < 0.06 ? 0.75 :
    drawdownPct < 0.10 ? 0.5  : 0.25;

  return (
    totalAssets *
    baseRiskPctMap[regime] *
    regimeFactorMap[regime] *
    setupFactor *
    drawdownFactor
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
  targetValue: number,
  totalAssets: number,
  costBasis: number,
  currentPrice: number,
  highestClose: number,
  atrPct: number,
  quantConfidence: number,
  weeklyDailyConflict: boolean,
  pendingStage: string | null,
): { action: ActionType; priority: number; notes: string[] } {
  const notes: string[] = [];
  const gap = targetValue - currentValue;
  const threshold = Math.max(targetValue * 0.20, totalAssets * 0.005);

  // PnL
  const pnlPct = costBasis > 0 ? (currentPrice - costBasis) / costBasis : 0;

  // Risk checks: hard stop / trailing stop
  const hardStopWinter = clamp(Math.max(0.08, 2.5 * atrPct), 0.08, 0.12);
  const hardStopSpring = clamp(Math.max(0.05, 2.0 * atrPct), 0.05, 0.10);
  const trailingStopSummer = clamp(Math.max(0.08, 2.5 * atrPct), 0.08, 0.12);

  // Force exit checks
  if (currentValue > 0 && costBasis > 0) {
    if (stage === "winter" && pnlPct <= -hardStopWinter) {
      return { action: "force_exit", priority: 0, notes: ["❗ 冬季硬止损触发"] };
    }
    if (stage === "spring" && pnlPct <= -hardStopSpring) {
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

  // Autumn: only exit
  if (stage === "autumn") {
    if (currentValue > 0) {
      notes.push("🍂 秋季目标仓位为零，执行退出");
      return { action: "exit_autumn", priority: 2, notes };
    }
    return { action: "hold", priority: 5, notes: ["🍂 秋季，无持仓"] };
  }

  // Reduce if over target
  if (currentValue > targetValue && Math.abs(gap) > threshold) {
    notes.push("📊 当前仓位高于目标，需减仓");
    return { action: "reduce", priority: 1, notes };
  }

  // Enter / Add
  if (gap > threshold) {
    const isConfirmed = stage === "spring" || stage === "summer";
    const highConfPending =
      (pendingStage === "spring" || pendingStage === "summer") &&
      quantConfidence >= 0.75 &&
      !weeklyDailyConflict;

    if (isConfirmed || highConfPending) {
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
  defaultQuotaPct: number,
  inputs: PositionInput[],
  classifications: Map<string, ClassificationResult>,
  equityPeak?: number, // v3.1: 账户历史高点，用于计算组合回撤刹车
): PortfolioResult {
  // Layer 1
  const market = computeMarketContext(classifications);

  // v3.1: 组合回撤计算
  const peak = equityPeak && equityPeak > totalAssets ? equityPeak : totalAssets;
  const portfolioDrawdownPct = Math.max(0, (peak - totalAssets) / peak);

  // Layer 2: compute each stock's target
  const singleNameSoftCap = totalAssets * 0.12;
  const singleNameHardCap = totalAssets * 0.15;

  const rawResults: StockPositionResult[] = [];

  for (const input of inputs) {
    const cls = classifications.get(input.symbol);
    const stage = cls
      ? (cls.finalStage !== "unknown" ? cls.finalStage : cls.stage)
      : "unknown";
    const quantConfidence = cls?.confidence ?? 0.5;
    const weeklyDailyConflict = cls?.flags?.weeklyDailyConflict ?? false;
    const pendingStage = null; // TODO: from persistence state

    const baseQuota = input.quotaValue ?? totalAssets * (defaultQuotaPct / 100);
    const effectiveQuota = Math.min(baseQuota, singleNameSoftCap);

    const sc = stageCoeffMap[stage] ?? 0;
    const cc = getConfidenceCoeff(quantConfidence);
    const atrPct = input.currentPrice > 0 ? input.atr20 / input.currentPrice : 0;
    const vf = getVolatilityFactor(atrPct);
    const cf = getConflictFactor(weeklyDailyConflict);
    const lf = getLiquidityFactor(input.liquidityLevel);

    let rawTarget = effectiveQuota * sc * cc * vf * cf * lf;
    rawTarget = Math.min(rawTarget, singleNameHardCap);

    const pnlPct = input.costBasis > 0
      ? (input.currentPrice - input.costBasis) / input.costBasis * 100
      : 0;

    // v3.1: 风险预算层
    const wyckoffEvent: WyckoffEvent = input.wyckoffEvent ?? "none";
    const effectiveSetupScore =
      input.setupScore !== undefined
        ? input.setupScore
        : setupScoreFromConfidence(quantConfidence);
    const riskBudgetValue = computeRiskBudget(
      totalAssets,
      market.regime,
      effectiveSetupScore,
      portfolioDrawdownPct,
    );
    const riskCappedValue = computeRiskCappedValue(
      riskBudgetValue,
      input.currentPrice,
      input.atr20,
      stage,
    );
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
      rawTarget,
      totalAssets,
      input.costBasis,
      input.currentPrice,
      input.highestCloseSinceEntry,
      atrPct,
      quantConfidence,
      weeklyDailyConflict,
      pendingStage,
    );

    // Add context notes
    const seasonNotes = {
      winter: "❄️ 冬季：小仓试错",
      spring: "🌱 春季：启动建仓",
      summer: "☀️ 夏季：主仓持有",
      autumn: "🍂 秋季：退出管理",
    };
    if (stage !== "unknown") {
      notes.unshift(seasonNotes[stage as Season] || "");
    }

    // v3.1: allowedEntryValue = min(positionGap, riskCappedValue)
    const positionGap = rawTarget - input.positionValue;
    const allowedEntryValue = positionGap > 0
      ? Math.min(positionGap, riskCappedValue)
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
      // v3.1 fields
      setupScore: effectiveSetupScore,
      wyckoffEvent,
      drawdownFactor,
      riskBudgetValue,
      riskCappedValue,
      allowedEntryValue,
    });
  }

  // Layer 2.9: Portfolio-level scaling
  const rawPortfolioTarget = rawResults.reduce((sum, r) => sum + r.rawTargetValue, 0);
  const capValue = market.portfolioCap * totalAssets;

  if (rawPortfolioTarget > capValue && rawPortfolioTarget > 0) {
    const scale = capValue / rawPortfolioTarget;
    for (const r of rawResults) {
      r.finalTargetValue = r.rawTargetValue * scale;
      r.positionGap = r.finalTargetValue - r.currentPositionValue;
      // v3.1: 重新计算缩放后的 allowedEntryValue
      r.allowedEntryValue = r.positionGap > 0
        ? Math.min(r.positionGap, r.riskCappedValue)
        : 0;
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
