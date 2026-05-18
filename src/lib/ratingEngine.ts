import { ClassificationResult, Stage, TransitionState, LongTermBackground, LongTermMomentum } from "./stockClassifier";

export type RatingLevel = "强烈买入" | "积极买入" | "观望" | "谨慎" | "回避";
export type MarketRegime = "牛市" | "熊市" | "震荡";

export interface RatingFactor {
  dimension: "长期背景" | "转折时机" | "量能验证" | "制度板块";
  description: string;
  score: number;
}

export interface CompositeRating {
  level: RatingLevel;
  totalScore: number;
  factors: RatingFactor[];
}

// ── 市场制度 ──────────────────────────────────────────────────────────────────
// 从股票池所有分类的 longTermBackground 分布推断当前市场制度
// 多头比例 > 55% → 牛市；空头比例 > 55% → 熊市；否则 → 震荡
export function computeMarketRegime(clsList: ClassificationResult[]): MarketRegime {
  let bull = 0, bear = 0;
  for (const cls of clsList) {
    const bg = cls.longTermBackground ?? "震荡";
    if (bg === "长期多头" || bg === "上行趋势") bull++;
    if (bg === "长期空头" || bg === "下行趋势") bear++;
  }
  const total = bull + bear;
  if (total < 5) return "震荡";
  if (bull / total > 0.55) return "牛市";
  if (bear / total > 0.55) return "熊市";
  return "震荡";
}

// ── 板块标准化 ────────────────────────────────────────────────────────────────
// 将数据库中的细粒度板块字段映射到 signal-atlas 的 7 大板块
export function normalizeSector(rawSector: string): string {
  if (!rawSector) return "其他";
  const s = rawSector;
  if (/银行|证券|保险|金融|信托|基金|期货/.test(s)) return "金融";
  if (/白酒|食品|饮料|消费|家电|家居|零售|传媒|娱乐|文具|猪|养殖|乳品|肉/.test(s)) return "消费";
  if (/医药|生物医药|医疗|器械|CRO|制药/.test(s)) return "医药";
  if (/半导体|芯片|科技|互联网|软件|通信|AI|人工智能|面板|显示|电子|计算机/.test(s)) return "科技";
  if (/新能源|光伏|风电|锂|储能|氢能|充电|电池/.test(s)) return "新能源";
  if (/煤炭|石油|石化|化工|矿|钢铁|地产|建筑|建材|水泥|玻璃|铜|铝|铁|黄金|有色|电力/.test(s)) return "周期";
  if (/机械|汽车|零部件|轮胎|航空|航运|物流|军工|国防|船舶|设备|电力设备/.test(s)) return "工业";
  return "其他";
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

export function computeCompositeRating(
  cls: ClassificationResult,
  symbol?: string,
  regime?: MarketRegime,
  sector?: string,
): CompositeRating {
  // 港股 5 位数字（00700 格式）→ 走港股独立模型（制度×板块调整暂不适用于港股）
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

  // ── 第四层：制度×板块调整（-1 ~ +1）────────────────────────────────────────
  // 基于 76,495 点×860 只信号矩阵回测（signal-atlas-v1）
  // 只在方向明确时调整，±1 封顶，避免覆盖基础信号
  if (regime && sector) {
    const preTotal = factors.reduce((s, f) => s + f.score, 0);
    // 门槛设为 ±3（非 ±2），只对强信号叠加制度调整
    // preTotal=2 的边缘积极买入不应因制度跨越强烈买入阈值（会过度稀释）
    const isBuyCtx  = preTotal >= 3;
    const isSellCtx = preTotal <= -3;
    const sec = normalizeSector(sector);

    let regScore = 0;
    let regDesc  = "";

    if (regime === "熊市") {
      // 熊市×金融/科技/消费：买入信号均值回归最强（+2.2~2.9%**）
      if (isBuyCtx && (sec === "金融" || sec === "科技" || sec === "消费")) {
        regScore = 1;
        regDesc  = `熊市×${sec}：底部买入信号强化（均值回归 alpha +2.2~2.9%**）`;
      }
      // 熊市×科技：卖出信号也显著（-4.14%*），双向有效
      if (isSellCtx && sec === "科技") {
        regScore = -1;
        regDesc  = "熊市×科技：卖出信号强化（alpha -4.14%*）";
      }
      // 熊市×工业：买入轻微加分（+0.91%**，t=5.68）
      if (isBuyCtx && sec === "工业" && regScore === 0) {
        regScore = 1;
        regDesc  = "熊市×工业：买入信号有效（alpha +0.91%**）";
      }
    } else if (regime === "牛市") {
      // 牛市×金融：买入信号反向（alpha -1.30%**），需降级
      if (isBuyCtx && sec === "金融") {
        regScore = -1;
        regDesc  = "牛市×金融：买入信号反向（alpha -1.30%**），降分";
      }
      // 牛市×周期：卖出信号在牛市反向（alpha +2.77%*），不宜追空
      if (isSellCtx && sec === "周期") {
        regScore = 1;
        regDesc  = "牛市×周期：卖出信号牛市中反向（alpha +2.77%*），谨慎做空";
      }
    } else if (regime === "震荡") {
      // 震荡×周期：买入信号显著失效（alpha -2.47%**）
      if (isBuyCtx && sec === "周期") {
        regScore = -1;
        regDesc  = "震荡×周期：买入信号失效（alpha -2.47%**）";
      }
    }

    if (regScore !== 0) push(factors, "制度板块", regDesc, regScore);
  }

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
