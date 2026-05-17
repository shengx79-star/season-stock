import { ClassificationResult, Stage, TransitionState, LongTermBackground } from "./stockClassifier";

export type RatingLevel = "强烈买入" | "积极买入" | "观望" | "谨慎" | "回避";

export interface RatingFactor {
  // 长期背景不再评分，仅作天花板（见 computeLevel）
  dimension: "转折时机" | "量能验证" | "蓄力信号";
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
  const volumeStage     = cls.volumeStage;
  const transitionState = cls.transitionState ?? null;
  const longTermBg      = cls.longTermBackground ?? "震荡";
  const upTurnCount     = cls.turnSignals?.upTurnCount   ?? 0;
  const downTurnCount   = cls.turnSignals?.downTurnCount ?? 0;
  const accScore        = cls.mediumTermAnalysis?.accumulationScore ?? 0;

  // ── 第一层：长期背景（纯过滤器，不评分）─────────────────────────────────
  // 回测证明：A 股均值回归强，多头背景 alpha=-1.10%，空头背景 alpha=+2.63%。
  // 正向评分会系统性拉反单调性。改为只设天花板，不主动加减分。

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

  // ── 第三层：量能验证（-1 ~ +1，叠加修正）───────────────────────────────
  // 回测证明量能层独立 alpha 微弱；改为只在转折方向一致时 ±1 补充确认。
  const priceBull = isBull(stage);
  const priceBear = isBear(stage);
  const volBull   = isBull(volumeStage);
  const volBear   = isBear(volumeStage);

  if (volumeStage !== "unknown") {
    let volScore = 0;
    let volDesc  = "";

    if (transScore > 0) {
      if (volBull && priceBear) { volScore =  1; volDesc = "底部吸筹确认：资金已在低位建仓"; }
      else if (volBull && priceBull) { volScore = 1; volDesc = "量价同步看多，趋势有效"; }
    } else if (transScore < 0) {
      if (volBear && priceBull) { volScore = -1; volDesc = "顶部派发确认：资金在高位撤出"; }
      else if (volBear && priceBear) { volScore = -1; volDesc = "量价同步看空，下跌有效"; }
    }

    if (volScore !== 0) push(factors, "量能验证", volDesc, volScore);
  }

  // ── 蓄力信号（0 ~ +1，单向修正）────────────────────────────────────────
  if (accScore >= 70 && (priceBull || stage === "winter") && upTurnCount >= 2) {
    push(factors, "蓄力信号", `蓄力 ${accScore} 分 + ${upTurnCount} 个转折信号，底部结构扎实`, 1);
  } else if (accScore >= 50 && stage === "spring") {
    push(factors, "蓄力信号", `蓄力 ${accScore} 分，有底部积累`, 1);
  }

  // ── 汇总 & 评级 ─────────────────────────────────────────────────────────
  const total = factors.reduce((s, f) => s + f.score, 0);
  const level = computeLevel(total, longTermBg);

  return { level, totalScore: total, factors };
}

function computeLevel(total: number, bg: LongTermBackground): RatingLevel {
  // 长期背景仅作天花板，不主动评分
  // 长期空头：弱势结构，最高给"谨慎"（不能强烈买入，但也不是"回避"）
  // 下行趋势：谨慎反弹，最高给"积极买入"
  const cap: Partial<Record<LongTermBackground, RatingLevel>> = {
    "长期空头": "谨慎",
    "下行趋势": "积极买入",
  };
  const ceiling = cap[bg];

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
