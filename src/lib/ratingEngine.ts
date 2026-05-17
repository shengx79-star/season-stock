import { ClassificationResult, Stage, TransitionState, LongTermBackground } from "./stockClassifier";

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

  const stage            = cls.stage;
  const volumeStage      = cls.volumeStage;
  const transitionState  = cls.transitionState  ?? null;
  const longTermBg       = cls.longTermBackground ?? "震荡";
  const upTurnCount      = cls.turnSignals?.upTurnCount   ?? 0;
  const downTurnCount    = cls.turnSignals?.downTurnCount ?? 0;
  const accScore         = cls.mediumTermAnalysis?.accumulationScore ?? 0;

  // ── 第一层：长期背景（-2 ~ +2）──────────────────────────────────────────
  // 决定评级天花板。长期空头背景下短期再强也最多给"观望"。
  const bgScoreMap: Record<LongTermBackground, number> = {
    "长期多头": 2, "上行趋势": 1, "震荡": 0, "下行趋势": -1, "长期空头": -2,
  };
  const bgScore = bgScoreMap[longTermBg];
  if (bgScore !== 0) {
    push(factors, "长期背景", `周线结构：${longTermBg}`, bgScore);
  }

  // ── 第二层：转折时机（-3 ~ +3）──────────────────────────────────────────
  // 回测证明：转折点（冬→春、夏→秋）是 Alpha 最高的信号。
  // 延伸期（夏盛期、冬深期）在 A 股均值回归特性下不加分也不减分。
  let transScore = 0;
  let transDesc  = "";

  if (transitionState === "冬→春") {
    transScore = 3;
    transDesc  = "冬→春转折，价格低位出现上行信号（最强买点）";
  } else if (transitionState === "夏→秋") {
    transScore = -3;
    transDesc  = "夏→秋转折，高位出现下行信号（最强卖点）";
  } else if (transitionState === "春→夏") {
    transScore = 1;
    transDesc  = "春→夏趋势确立，持仓为主";
  } else if (transitionState === "秋→冬") {
    transScore = -1;
    transDesc  = "秋→冬确认，趋势向下，等待止跌";
  } else {
    // 无明确转折，按当前阶段给较保守的分
    if (stage === "spring" && upTurnCount >= 2) {
      transScore = 2; transDesc = "春季确认（双转折信号）";
    } else if (stage === "spring") {
      transScore = 1; transDesc = "春季启动（待确认）";
    } else if (stage === "summer") {
      transScore = 0; transDesc = "夏季延续（持仓观察，非新买点）";
    } else if (stage === "autumn" && downTurnCount >= 2) {
      transScore = -2; transDesc = "秋季确认（双转折信号）";
    } else if (stage === "autumn") {
      transScore = -1; transDesc = "秋季转弱";
    } else if (stage === "winter") {
      transScore = 0; transDesc = "冬季调整（A 股均值回归，观望）";
    }
  }

  if (transDesc) push(factors, "转折时机", transDesc, transScore);

  // ── 第三层：量能验证（-2 ~ +2）──────────────────────────────────────────
  // 量价关系是独立信号源，最强信号是"价格弱但资金在买"和"价格强但资金在跑"。
  const priceBull = isBull(stage);
  const priceBear = isBear(stage);
  const volBull   = isBull(volumeStage);
  const volBear   = isBear(volumeStage);

  let volScore = 0;
  let volDesc  = "";

  if (volBull && priceBear) {
    volScore = 2;  volDesc = "底部隐性吸筹：价格弱但资金持续净流入";
  } else if (volBear && priceBull) {
    volScore = -2; volDesc = "顶部隐性派发：价格强但资金已悄然流出";
  } else if (volBull && priceBull) {
    volScore = 1;  volDesc = "量价同步看多";
  } else if (volBear && priceBear) {
    volScore = -1; volDesc = "量价同步看空";
  }

  if (volScore !== 0 && volumeStage !== "unknown") {
    push(factors, "量能验证", volDesc, volScore);
  }

  // ── 蓄力信号（0 ~ +1，单向修正）────────────────────────────────────────
  // 仅在看多方向有底部蓄力时补充 +1，不做空头方向的对称惩罚。
  if (accScore >= 70 && (priceBull || stage === "winter") && upTurnCount >= 2) {
    push(factors, "蓄力信号", `蓄力 ${accScore} 分 + ${upTurnCount} 个转折信号，底部结构扎实`, 1);
  } else if (accScore >= 50 && stage === "spring") {
    push(factors, "蓄力信号", `蓄力 ${accScore} 分，有底部积累`, 1);
  }

  // ── 汇总 & 评级 ─────────────────────────────────────────────────────────
  const total = factors.reduce((s, f) => s + f.score, 0);

  // 长期空头背景下，正向评级上限为"观望"（即使转折信号强也不给买入）
  const level = computeLevel(total, longTermBg);

  return { level, totalScore: total, factors };
}

function computeLevel(total: number, bg: LongTermBackground): RatingLevel {
  // 长期背景对评级的天花板限制
  const cap: Partial<Record<LongTermBackground, RatingLevel>> = {
    "长期空头": "观望",   // 长期空头：最高只给观望
    "下行趋势": "积极买入", // 下行趋势：最高给积极买入（谨慎买反弹）
  };
  const ceiling = cap[bg];

  const LEVELS: RatingLevel[] = ["强烈买入", "积极买入", "观望", "谨慎", "回避"];
  let level: RatingLevel;
  if      (total >= 4)  level = "强烈买入";
  else if (total >= 2)  level = "积极买入";
  else if (total >= -1) level = "观望";
  else if (total >= -3) level = "谨慎";
  else                  level = "回避";

  // 应用天花板
  if (ceiling) {
    const ceilIdx  = LEVELS.indexOf(ceiling);
    const levelIdx = LEVELS.indexOf(level);
    if (levelIdx < ceilIdx) level = ceiling; // 如果当前评级比天花板更激进，降至天花板
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
