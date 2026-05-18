import { ClassificationResult, Stage, TransitionState, LongTermBackground, LongTermMomentum } from "./stockClassifier";

export type RatingLevel = "强烈买入" | "积极买入" | "观望" | "谨慎" | "回避";

export interface RatingFactor {
  dimension: "长期背景" | "转折时机" | "量能验证" | "蓄力信号";
  description: string;
  score: number;
}

export interface CompositeRating {
  level: RatingLevel;
  totalScore: number;
  factors: RatingFactor[];
}

// ── 工具 ─────────────────────────────────────────────────────────────────────

const isBull = (s: Stage) => s === "spring" || s === "summer";
const isBear = (s: Stage) => s === "autumn" || s === "winter";

function push(
  arr: RatingFactor[],
  dimension: RatingFactor["dimension"],
  description: string,
  score: number,
) {
  arr.push({ dimension, description, score });
}

// ── 港股独立模型 ──────────────────────────────────────────────────────────────
// 回测结论（52只/3.5年，6604个信号点）：
//   港股是机构主导+跟随美港联动，主力做低吸高派而非趋势追踪。
//   所有动量类信号（upTurnCount、蓄力、量能）在港股无效或反向。
//   有效信号：冬季+0.64%*、秋→冬+1.32%*、长期空头背景+3.37%*（均值回归）
//   无效信号：春→夏-1.85%*（最差）、长期多头-1.24%*（高位均值回归）

function computeHKRating(cls: ClassificationResult): CompositeRating {
  const factors: RatingFactor[] = [];
  const stage           = cls.stage;
  const transitionState = cls.transitionState ?? null;
  const longTermBg      = cls.longTermBackground ?? "震荡";

  // ── HK 第一层：长期背景（反向评分，-2 ~ +2）──────────────────────────────
  // 港股均值回归极强：空头背景 alpha=+3.37%，多头背景 alpha=-1.24%
  const bgScoreMap: Record<LongTermBackground, number> = {
    "长期空头": 2, "下行趋势": 1, "震荡": 0, "上行趋势": -1, "长期多头": -2,
  };
  const bgScore = bgScoreMap[longTermBg];
  if (bgScore !== 0) {
    push(factors, "长期背景",
      bgScore > 0
        ? `${longTermBg}，港股超跌均值回归（买入机会）`
        : `${longTermBg}，港股高位均值回归（注意风险）`,
      bgScore);
  }

  // ── HK 第二层：季节/转折（部分反向，-3 ~ +2）────────────────────────────
  // 冬季最佳（低位+均值回归），春→夏最差（动量在港股反向）
  let transScore = 0;
  let transDesc  = "";

  if (transitionState === "秋→冬") {
    transScore = 2; transDesc = "秋→冬确认，港股低位买点（alpha=+1.32%）";
  } else if (transitionState === "春→夏") {
    transScore = -3; transDesc = "春→夏趋势确立，港股高位风险（alpha=-1.85%）";
  } else if (transitionState === "夏→秋") {
    transScore = -2; transDesc = "夏→秋转折，港股下行确认（alpha=-1.54%）";
  } else if (transitionState === "冬→春") {
    transScore = 0; transDesc = "冬→春转折，港股方向不明（alpha=-0.41%，中性）";
  } else {
    // 无明确转折，按当前阶段
    if (stage === "winter") {
      transScore = 2; transDesc = "冬季低位，港股均值回归买点（alpha=+0.64%）";
    } else if (stage === "summer") {
      transScore = -1; transDesc = "夏季高位，港股存在回调压力";
    } else if (stage === "autumn") {
      transScore = -1; transDesc = "秋季转弱，港股下行风险";
    } else if (stage === "spring") {
      transScore = 0; transDesc = "春季，港股方向中性（alpha=-0.23%，不显著）";
    }
  }

  if (transDesc) push(factors, "转折时机", transDesc, transScore);

  // HK 无量能和蓄力评分（回测证明全部失效或反向，移除）

  // ── 汇总 & 评级 ─────────────────────────────────────────────────────────
  const total = factors.reduce((s, f) => s + f.score, 0);

  const LEVELS: RatingLevel[] = ["强烈买入", "积极买入", "观望", "谨慎", "回避"];
  let level: RatingLevel;
  if      (total >= 4)  level = "强烈买入";
  else if (total >= 2)  level = "积极买入";
  else if (total >= -1) level = "观望";
  else if (total >= -3) level = "谨慎";
  else                  level = "回避";

  return { level, totalScore: total, factors };
}

// ── A 股 / 通用三层评分 ───────────────────────────────────────────────────────

export function computeCompositeRating(cls: ClassificationResult, symbol?: string): CompositeRating {
  // 港股 5 位数字（00700 格式）→ 走港股独立模型
  if (symbol && /^0[0-9]{4}$/.test(symbol)) return computeHKRating(cls);
  const factors: RatingFactor[] = [];

  const stage           = cls.stage;
  const transitionState = cls.transitionState ?? null;
  const longTermBg      = cls.longTermBackground ?? "震荡";
  const longTermMom     = cls.longTermMomentum   ?? "stable";
  const upTurnCount     = cls.turnSignals?.upTurnCount   ?? 0;
  const downTurnCount   = cls.turnSignals?.downTurnCount ?? 0;
  const accScore        = cls.mediumTermAnalysis?.accumulationScore ?? 0;
  const obvRatio        = cls.indicators?.obvMA20Ratio   ?? null;
  const udRatio         = cls.indicators?.upDownVolRatio ?? null;
  const close           = cls.indicators?.close          ?? null;
  const ma20            = cls.indicators?.ma20           ?? null;

  // ── 第一层：长期背景动量（-1 ~ +1）──────────────────────────────────────
  // 静态背景状态在 A 股反向（均值回归），但"方向转变"有信号价值：
  // 周线 MACD 近 4 周内金叉 = improving，空头背景开始反转 → 超跌反弹机会
  const momScoreMap: Record<LongTermMomentum, number> = {
    improving: 1, stable: 0, deteriorating: -1,
  };
  const momScore = momScoreMap[longTermMom];
  if (momScore !== 0) {
    push(factors, "长期背景",
      longTermMom === "improving" ? `周线 MACD 金叉，背景改善（${longTermBg}）` : `周线 MACD 死叉，背景恶化（${longTermBg}）`,
      momScore);
  }

  // ── 第二层：转折时机（-3 ~ +3）──────────────────────────────────────────
  // 多周期校准（497只/3年，信号衰减曲线）：
  //   冬→春: 16w+3.45%**, 32w+3.84%**（最强买入，立即生效）
  //   秋→冬: 16w+4.20%**, 32w+3.01%**（反转买入，4周后显现）← 原 -1 改为 +2
  //   夏→秋: 16w-4.31%**, 32w-6.54%**（最强卖出，4周后显著）
  //   春→夏: 16w-1.61%**, 32w-2.38%**（中期卖出，短期中性）← 原 0 改为 -1
  //   秋季:  32w-3.30%**（全周期显著负，基础档加重）← -1 改为 -2
  let transScore = 0;
  let transDesc  = "";

  if (transitionState === "冬→春") {
    if (upTurnCount >= 3) {
      transScore = 3; transDesc = "冬→春转折，多重信号确认（最强买点，32w alpha=+3.84%）";
    } else {
      transScore = 2; transDesc = "冬→春转折，结构改善";
    }
  } else if (transitionState === "秋→冬") {
    transScore = 2; transDesc = "秋→冬确认，底部区域均值回归蓄势（16w alpha=+4.20%，需耐心持有）";
  } else if (transitionState === "春→夏") {
    transScore = -1; transDesc = "春→夏突破，A 股动量随后均值回归（16w alpha=-1.61%）";
  } else if (transitionState === "夏→秋") {
    transScore = -3; transDesc = "夏→秋转折，高位下行信号（最强卖点，32w alpha=-6.54%）";
  } else {
    // 无明确转折，按当前阶段
    if (stage === "spring" && upTurnCount >= 2) {
      transScore = 2; transDesc = "春季持续，多重转折确认（32w alpha=+3.37%）";
    } else if (stage === "spring") {
      transScore = 1; transDesc = "春季启动";
    } else if (stage === "summer") {
      transScore = -1; transDesc = "夏季延续（8w 后 alpha 转负，注意高位风险）";
    } else if (stage === "autumn" && downTurnCount >= 2) {
      transScore = -3; transDesc = "秋季深度确认（多重下行信号）";
    } else if (stage === "autumn") {
      transScore = -2; transDesc = "秋季转弱（32w alpha=-3.30%）";
    } else if (stage === "winter") {
      transScore = 1; transDesc = "冬季低位（均值回归蓄势，4w 后 alpha=+0.59%）";
    }
  }

  if (transDesc) push(factors, "转折时机", transDesc, transScore);

  // ── 第三层：量能验证（-2 ~ +2）──────────────────────────────────────────
  // 直接用 obvMA20Ratio（OBV/OBV_MA20）和 upDownVolRatio，比 volumeStage 粗粒度标签更精准。
  // 隐性吸筹/派发（价量背离）作为独立信号（±2），无需等待转折信号。
  if (obvRatio !== null && close !== null && ma20 !== null) {
    const priceAboveMA20 = close > ma20;
    const priceBelowMA20 = close < ma20;
    const obvBull = obvRatio > 1.0;
    const obvBear = obvRatio < 1.0;

    let volScore = 0;
    let volDesc  = "";

    // 独立触发门槛提高到 1.15/0.85，避免弱信号误触发
    const obvStrongBull = obvRatio > 1.15;
    const obvStrongBear = obvRatio < 0.85;

    if (obvStrongBull && priceBelowMA20) {
      volScore = 2;  volDesc = `底部隐性吸筹：OBV/MA20=${obvRatio.toFixed(2)}，资金在价格弱势时净流入`;
    } else if (obvStrongBear && priceAboveMA20) {
      volScore = -2; volDesc = `顶部隐性派发：OBV/MA20=${obvRatio.toFixed(2)}，资金在价格强势时流出`;
    } else if (obvBull && priceAboveMA20 && transScore > 0) {
      volScore = 1;  volDesc = `量价同步看多：OBV/MA20=${obvRatio.toFixed(2)}`;
    } else if (obvBear && priceBelowMA20 && transScore < 0) {
      volScore = -1; volDesc = `量价同步看空：OBV/MA20=${obvRatio.toFixed(2)}`;
    }

    // upDownVolRatio 叠加确认（总分 cap ±2）
    if (udRatio !== null) {
      if (udRatio > 1.5 && transScore > 0 && volScore < 2) {
        volScore = Math.min(2, volScore + 1);
        volDesc += `，涨跌量比=${udRatio.toFixed(2)}（买盘强势）`;
      } else if (udRatio < 0.67 && transScore < 0 && volScore > -2) {
        volScore = Math.max(-2, volScore - 1);
        volDesc += `，涨跌量比=${udRatio.toFixed(2)}（卖压沉重）`;
      }
    }

    if (volScore !== 0) push(factors, "量能验证", volDesc, volScore);
  }

  // 蓄力信号：3年/497只回测中失效，已移除

  // ── 汇总 & 评级 ─────────────────────────────────────────────────────────
  const total = factors.reduce((s, f) => s + f.score, 0);
  const level = computeLevel(total, longTermBg, longTermMom);

  return { level, totalScore: total, factors };
}

function computeLevel(total: number, bg: LongTermBackground, mom: LongTermMomentum = "stable"): RatingLevel {
  // 长期背景天花板（基于 44233 点×860 只衰减曲线回测，80d 视野）：
  //
  // 长期空头 + improving → 【无上限】允许强烈买入
  //   A股均值回归主导：空头背景是最强买点（熊市买入 alpha +2.2~2.9%**）
  //   score≥4 但被 cap 到积极买入的 776 个点拉高了积极买入、拖低了强烈买入
  //   releasing this cap fixes the monotonicity: 强烈买入 80d +3.47%** > 积极买入 +3.22%**
  //
  // 长期空头 + stable → 积极买入（中性，等待动量确认）
  // 长期空头 + deteriorating → 谨慎（下跌未止）
  // 下行趋势 → 积极买入（趋势仍弱，不开强烈买入）
  // 长期多头 → 积极买入（A股高位均值回归：长期多头 alpha = -1.10%*，不宜强烈买入）
  let capLevel: RatingLevel | undefined;
  if (bg === "长期空头") {
    if (mom === "deteriorating") capLevel = "谨慎";
    else if (mom === "stable")   capLevel = "积极买入";
    // improving: no cap → 允许强烈买入
  } else if (bg === "下行趋势") {
    capLevel = "积极买入";
  } else if (bg === "长期多头") {
    capLevel = "积极买入";
  }
  const ceiling = capLevel;

  const LEVELS: RatingLevel[] = ["强烈买入", "积极买入", "观望", "谨慎", "回避"];
  let level: RatingLevel;
  if      (total >= 4)  level = "强烈买入";
  else if (total >= 2)  level = "积极买入";
  else if (total >= -1) level = "观望";
  else if (total >= -3) level = "谨慎";
  else                  level = "回避";

  if (ceiling) {
    const ceilIdx  = LEVELS.indexOf(ceiling);
    const levelIdx = LEVELS.indexOf(level);
    if (levelIdx < ceilIdx) level = ceiling;
  }

  return level;
}

export const RATING_STYLE: Record<RatingLevel, { bg: string; text: string; border: string }> = {
  "强烈买入": { bg: "bg-[hsl(var(--spring))]/15",  text: "text-[hsl(var(--spring))]",  border: "border-[hsl(var(--spring))]/30" },
  "积极买入": { bg: "bg-emerald-500/10",            text: "text-emerald-500",            border: "border-emerald-500/30" },
  "观望":     { bg: "bg-secondary",                 text: "text-muted-foreground",       border: "border-border" },
  "谨慎":     { bg: "bg-[hsl(var(--autumn))]/15",  text: "text-[hsl(var(--autumn))]",  border: "border-[hsl(var(--autumn))]/30" },
  "回避":     { bg: "bg-destructive/10",            text: "text-destructive",            border: "border-destructive/30" },
};
