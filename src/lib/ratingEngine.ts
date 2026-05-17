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

// ── 三层评分 ─────────────────────────────────────────────────────────────────

export function computeCompositeRating(cls: ClassificationResult): CompositeRating {
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
  // 回测结论：春→夏 alpha=+1.57%（最强买点），冬→春 alpha=-0.25%（待确认）
  //           夏→秋 alpha=-1.33%（最强卖点）
  let transScore = 0;
  let transDesc  = "";

  if (transitionState === "春→夏") {
    transScore = 3;
    transDesc  = "春→夏趋势确立，动量加速（最强买点）";
  } else if (transitionState === "冬→春") {
    if (upTurnCount >= 3) {
      transScore = 2; transDesc = "冬→春转折，多重信号确认";
    } else {
      transScore = 1; transDesc = "冬→春转折初现，待确认";
    }
  } else if (transitionState === "夏→秋") {
    transScore = -3;
    transDesc  = "夏→秋转折，高位下行信号（最强卖点）";
  } else if (transitionState === "秋→冬") {
    transScore = -1;
    transDesc  = "秋→冬确认，趋势向下";
  } else {
    // 无明确转折，按当前阶段给保守分
    if (stage === "spring" && upTurnCount >= 2) {
      transScore = 1; transDesc = "春季持续，转折信号多次确认";
    } else if (stage === "spring") {
      transScore = 1; transDesc = "春季启动（待确认）";
    } else if (stage === "summer") {
      transScore = 0; transDesc = "夏季延续（持仓观察，非新买点）";
    } else if (stage === "autumn" && downTurnCount >= 2) {
      transScore = -2; transDesc = "秋季深度确认";
    } else if (stage === "autumn") {
      transScore = -1; transDesc = "秋季转弱";
    } else if (stage === "winter") {
      transScore = 0; transDesc = "冬季调整（A 股均值回归，观望而非回避）";
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

  // ── 蓄力信号（0 ~ +1，单向修正）────────────────────────────────────────
  const priceBull = isBull(stage);
  if (accScore >= 70 && (priceBull || stage === "winter") && upTurnCount >= 2) {
    push(factors, "蓄力信号", `蓄力 ${accScore} 分 + ${upTurnCount} 个转折信号，底部结构扎实`, 1);
  } else if (accScore >= 50 && stage === "spring") {
    push(factors, "蓄力信号", `蓄力 ${accScore} 分，有底部积累`, 1);
  }

  // ── 汇总 & 评级 ─────────────────────────────────────────────────────────
  const total = factors.reduce((s, f) => s + f.score, 0);
  const level = computeLevel(total, longTermBg, longTermMom);

  return { level, totalScore: total, factors };
}

function computeLevel(total: number, bg: LongTermBackground, mom: LongTermMomentum = "stable"): RatingLevel {
  // 长期背景天花板：
  // 长期空头 + improving（周线 MACD 翻多）→ 超跌反弹机会，放开到"积极买入"
  // 长期空头 + stable/deteriorating → 维持"谨慎"
  // 下行趋势 → "积极买入"
  let capLevel: RatingLevel | undefined;
  if (bg === "长期空头") {
    capLevel = mom === "improving" ? "积极买入" : "谨慎";
  } else if (bg === "下行趋势") {
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
