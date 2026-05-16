import { ClassificationResult, Stage } from "./stockClassifier";

export type RatingLevel = "强烈买入" | "积极买入" | "观望" | "谨慎" | "回避";

export interface RatingFactor {
  dimension: "中期方向" | "短期时机" | "量验证" | "蓄力转折";
  description: string;
  score: number;
}

export interface CompositeRating {
  level: RatingLevel;
  totalScore: number;
  factors: RatingFactor[];
}

const STAGE_LABEL: Record<string, string> = {
  spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季",
};

const isBull = (s: Stage) => s === "spring" || s === "summer";
const isBear = (s: Stage) => s === "autumn" || s === "winter";

export function computeCompositeRating(cls: ClassificationResult): CompositeRating {
  const factors: RatingFactor[] = [];
  let total = 0;

  const shortStage = cls.stage;
  const medStage   = cls.mediumTermAnalysis?.stage ?? "unknown";
  const volStage   = cls.volumeStage;
  const accScore   = cls.mediumTermAnalysis?.accumulationScore ?? 0;
  const upTurn     = cls.turnSignals?.upTurnCount ?? 0;
  const downTurn   = cls.turnSignals?.downTurnCount ?? 0;

  // ── 1. 中期方向（决定大背景，最高 ±2）────────────────
  if (medStage !== "unknown") {
    if (isBull(medStage)) {
      push(factors, "中期方向", `中期${STAGE_LABEL[medStage]}，大背景向好`, 2);
    } else {
      push(factors, "中期方向", `中期${STAGE_LABEL[medStage]}，大背景不利`, -2);
    }
  }

  // ── 2. 短期时机（在中期框架下找入场点，最高 ±2）──────
  if (shortStage !== "unknown") {
    let score = 0;
    let desc  = "";

    if (isBull(medStage)) {
      if (shortStage === "spring")  { score =  2; desc = "短期春季，黄金入场点"; }
      else if (shortStage === "summer") { score = 1; desc = "短期夏季，趋势中持有"; }
      else if (shortStage === "winter") { score = 0; desc = "短期冬季，等待企稳"; }
      else                           { score = -1; desc = "短期秋季，注意转弱"; }
    } else if (isBear(medStage)) {
      if (shortStage === "spring")  { score = -1; desc = "短期春季，下跌中反弹，谨慎"; }
      else if (shortStage === "summer") { score = -1; desc = "短期夏季，中期背景弱，勿追"; }
      else if (shortStage === "autumn") { score = -2; desc = "短期秋季，趋势向下"; }
      else                           { score = -2; desc = "短期冬季，空头确立"; }
    } else {
      // 中期未知，单看短期
      if (shortStage === "spring")  { score =  1; desc = "短期春季启动"; }
      else if (shortStage === "summer") { score = 1; desc = "短期夏季趋势"; }
      else if (shortStage === "autumn") { score = -1; desc = "短期秋季转弱"; }
      else                           { score = -1; desc = "短期冬季调整"; }
    }

    if (score !== 0) push(factors, "短期时机", desc, score);
  }

  // ── 3. 量验证（最高 ±2）────────────────────────────
  if (volStage !== "unknown") {
    const priceBull = isBull(shortStage);
    const priceBear = isBear(shortStage);
    const volBull   = isBull(volStage);
    const volBear   = isBear(volStage);
    let score = 0;
    let desc  = "";

    if (volBull && priceBear) {
      score =  2; desc = `量${STAGE_LABEL[volStage]}，价低位资金已流入（隐性吸筹）`;
    } else if (volBear && priceBull) {
      score = -2; desc = `量${STAGE_LABEL[volStage]}，价高位资金已流出（隐性派发）`;
    } else if (volBull && priceBull) {
      score =  1; desc = `量${STAGE_LABEL[volStage]}，量价同步看多`;
    } else if (volBear && priceBear) {
      score = -1; desc = `量${STAGE_LABEL[volStage]}，量价同步看空`;
    }

    if (score !== 0) push(factors, "量验证", desc, score);
  }

  // ── 4. 蓄力 + 转折（最高 ±1）──────────────────────
  {
    let score = 0;
    let desc  = "";

    if (accScore >= 70 && isBull(shortStage)) {
      score = 1;
      desc = `蓄力${accScore}分，底部结构扎实` + (upTurn >= 2 ? "，转折已确认" : "");
    } else if (upTurn >= 2 && shortStage === "spring") {
      score = 1;
      desc = `${upTurn}个转折信号，春季启动确认`;
    } else if (accScore >= 50 && shortStage === "spring") {
      score = 1;
      desc = `蓄力${accScore}分，有一定底部积累`;
    } else if (downTurn >= 2 && isBear(shortStage)) {
      score = -1;
      desc = `${downTurn}个下行转折信号，下跌趋势确认`;
    }

    if (score !== 0) push(factors, "蓄力转折", desc, score);
  }

  total = factors.reduce((s, f) => s + f.score, 0);

  let level: RatingLevel;
  if      (total >= 4)  level = "强烈买入";
  else if (total >= 2)  level = "积极买入";
  else if (total >= -1) level = "观望";
  else if (total >= -3) level = "谨慎";
  else                  level = "回避";

  return { level, totalScore: total, factors };
}

function push(
  arr: RatingFactor[],
  dimension: RatingFactor["dimension"],
  description: string,
  score: number,
) {
  arr.push({ dimension, description, score });
}

export const RATING_STYLE: Record<RatingLevel, { bg: string; text: string; border: string }> = {
  "强烈买入": { bg: "bg-[hsl(var(--spring))]/15",  text: "text-[hsl(var(--spring))]",  border: "border-[hsl(var(--spring))]/30" },
  "积极买入": { bg: "bg-emerald-500/10",            text: "text-emerald-500",            border: "border-emerald-500/30" },
  "观望":     { bg: "bg-secondary",                 text: "text-muted-foreground",       border: "border-border" },
  "谨慎":     { bg: "bg-[hsl(var(--autumn))]/15",  text: "text-[hsl(var(--autumn))]",  border: "border-[hsl(var(--autumn))]/30" },
  "回避":     { bg: "bg-destructive/10",            text: "text-destructive",            border: "border-destructive/30" },
};
