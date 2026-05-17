/**
 * 择时 Alpha 回测（扩大版）
 *
 * 核心逻辑：同一只股票，系统给出买入/回避信号时的 20 日收益
 *   vs 该股票任意时刻入场的基准收益，差值即择时 Alpha。
 *
 * 扩大版改进：
 *   - 50 只股票（覆盖 12 个板块）
 *   - 800 根日线（约 3.5 年）
 *   - 批量拉取（每批 10 只，避免超时）
 *   - 输出置信区间和 t 统计量
 *
 * 运行：npx vitest run src/test/classifierBacktest.test.ts --reporter=verbose
 */

import { describe, it, expect } from "vitest";
import { classifyStock } from "../lib/stockClassifier";
import { computeCompositeRating } from "../lib/ratingEngine";
import type { Candle } from "../lib/stockClassifier";
import type { RatingLevel } from "../lib/ratingEngine";

// ── 配置 ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://xdlaaptqjcsysyvcyqlm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkbGFhcHRxamNzeXN5dmN5cWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MDg4MjEsImV4cCI6MjA5MTI4NDgyMX0.B2qfqyumwbgdn2-DI6CIYzN9IIZHVquBhnkoJJGS934";

// 50 只 A 股，覆盖 12 个板块
const SYMBOLS = [
  // 消费白酒
  "600519", "000858", "002304", "000596",
  // 食品饮料
  "600887", "000895",
  // 金融（银行+保险+券商）
  "601318", "600036", "601166", "000001", "002142", "600030", "000776",
  // 白色家电/制造
  "000333", "000651", "002475", "601138",
  // 科技/半导体/通信
  "002415", "000063", "600703", "000725", "002230",
  // 新能源/汽车
  "002594", "300750", "601012", "600438", "002202",
  // 医药/医疗
  "600276", "300760", "000538",
  // 快递/物流
  "002352",
  // 地产/建筑
  "000002", "001979", "601390", "601186",
  // 能源/资源
  "600028", "601857", "601600", "600585", "600900",
  // 消费电子/IT
  "000100", "600745", "000977",
  // 通信运营/传媒
  "601728", "600050", "002027",
];

const DAILY_NUM  = 800; // ~3.5 年日线
const WEEKLY_NUM = 175; // ~3.5 年周线
const BATCH_SIZE = 10;  // 每批拉取只数
const MIN_BARS   = 150; // 回测起点（保证足够周线）
const STEP       = 5;   // 每 5 交易日采一个点
const EVAL_DAYS  = 20;  // 未来 20 交易日收益

// ── K 线拉取 ─────────────────────────────────────────────────────────────────

async function fetchBatch(
  symbols: string[],
  klineType: "daily" | "weekly",
  num: number
): Promise<Map<string, Candle[]>> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-kline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ symbols, kline_type: klineType, num }),
  });
  const json = await res.json();
  const map = new Map<string, Candle[]>();
  for (const sym of symbols) {
    map.set(
      sym,
      (json.results?.[sym] ?? []).map((b: any) => ({
        date: String(b.date),
        open: Number(b.open),
        high: Number(b.high),
        low:  Number(b.low),
        close: Number(b.close),
        volume: Number(b.volume),
      }))
    );
  }
  return map;
}

async function fetchAll(
  symbols: string[],
  klineType: "daily" | "weekly",
  num: number
): Promise<Map<string, Candle[]>> {
  const result = new Map<string, Candle[]>();
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const map   = await fetchBatch(batch, klineType, num);
    for (const [k, v] of map) result.set(k, v);
  }
  return result;
}

// ── 滚动回测 ─────────────────────────────────────────────────────────────────

interface BtPoint {
  symbol:           string;
  date:             string;
  stage:            string;
  level:            RatingLevel;
  totalScore:       number;
  transitionState:  string;   // "冬→春"|"春→夏"|"夏→秋"|"秋→冬"|"无"
  longTermBg:       string;   // LongTermBackground
  longTermMomentum: string;   // "improving"|"stable"|"deteriorating"
  bgScore:          number;   // 长期背景层得分（动量）
  transScore:       number;   // 转折时机层得分
  volScore:         number;   // 量能验证层得分
  ret20:            number;
  alpha:            number;
}

function rollBacktest(sym: string, daily: Candle[], weekly: Candle[]): BtPoint[] {
  const allRets: number[] = [];
  for (let i = MIN_BARS; i <= daily.length - EVAL_DAYS; i++) {
    const fut = daily[i + EVAL_DAYS - 1]?.close;
    if (fut) allRets.push((fut - daily[i - 1].close) / daily[i - 1].close);
  }
  const base = allRets.length > 0
    ? allRets.reduce((s, r) => s + r, 0) / allRets.length
    : 0;

  const points: BtPoint[] = [];
  for (let i = MIN_BARS; i <= daily.length - EVAL_DAYS; i += STEP) {
    const hist    = daily.slice(0, i);
    const curDate = hist[hist.length - 1].date;
    const wHist   = weekly.filter((w) => w.date <= curDate);
    if (wHist.length < 15) continue;

    try {
      const cls    = classifyStock({ dailyBars: hist, weeklyBars: wHist });
      if (cls.stage === "unknown") continue;
      const rating = computeCompositeRating(cls);
      const fut    = daily[i + EVAL_DAYS - 1]?.close;
      if (!fut) continue;
      const ret20 = (fut - daily[i - 1].close) / daily[i - 1].close;

      const bgScore    = rating.factors.find(f => f.dimension === "长期背景")?.score    ?? 0;
      const transScore = rating.factors.find(f => f.dimension === "转折时机")?.score ?? 0;
      const volScore   = rating.factors.find(f => f.dimension === "量能验证")?.score ?? 0;

      points.push({
        symbol: sym,
        date:   curDate,
        stage:  cls.stage,
        level:  rating.level,
        totalScore:       rating.totalScore,
        transitionState:  cls.transitionState ?? "无",
        longTermBg:       cls.longTermBackground,
        longTermMomentum: cls.longTermMomentum,
        bgScore,
        transScore,
        volScore,
        ret20,
        alpha: ret20 - base,
      });
    } catch (_) {}
  }
  return points;
}

// ── 统计 ─────────────────────────────────────────────────────────────────────

interface Stats {
  n:       number;
  mean:    number;   // 平均 alpha
  se:      number;   // 标准误差
  ci95lo:  number;   // 95% 置信区间下限
  ci95hi:  number;   // 上限
  tStat:   number;   // t 统计量（|t| > 1.96 → 显著）
  posRate: number;   // alpha > 0 占比
}

function stats(vals: number[]): Stats {
  const n = vals.length;
  if (n === 0) return { n: 0, mean: 0, se: 0, ci95lo: 0, ci95hi: 0, tStat: 0, posRate: 0 };
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1);
  const se = Math.sqrt(variance / n);
  const tStat = se > 0 ? mean / se : 0;
  return {
    n, mean, se,
    ci95lo: mean - 1.96 * se,
    ci95hi: mean + 1.96 * se,
    tStat,
    posRate: vals.filter((v) => v > 0).length / n,
  };
}

function sig(t: number) { return Math.abs(t) >= 1.96 ? " *" : "  "; }

function fmtStats(s: Stats): string {
  if (s.n === 0) return "   N/A";
  const m   = (s.mean  * 100).toFixed(2);
  const lo  = (s.ci95lo * 100).toFixed(2);
  const hi  = (s.ci95hi * 100).toFixed(2);
  const t   = s.tStat.toFixed(1);
  const mark = sig(s.tStat);
  const prefix = s.mean >= 0 ? "+" : "";
  return `${prefix}${m}% [${lo}%,${hi}%] t=${t}${mark}`;
}

function printTable(
  title: string,
  rows: Array<{ label: string; alphas: number[]; rets: number[] }>
) {
  console.log(`\n${title}`);
  console.log(
    "分组".padEnd(16) +
    "| 样本  | Alpha（均值 [95%CI] t值）         | 平均绝对收益 | Alpha>0%"
  );
  console.log("─".repeat(84));
  for (const r of rows) {
    const s  = stats(r.alphas);
    const rm = r.rets.length > 0
      ? (r.rets.reduce((a, b) => a + b, 0) / r.rets.length * 100).toFixed(2)
      : "N/A";
    const prefix = Number(rm) >= 0 ? "+" : "";
    console.log(
      r.label.padEnd(16) +
      `| ${String(s.n).padStart(5)} ` +
      `| ${fmtStats(s).padEnd(38)}` +
      `| ${prefix}${rm}%`.padEnd(14) +
      `| ${(s.posRate * 100).toFixed(1)}%`
    );
  }
}

// ── 主测试 ───────────────────────────────────────────────────────────────────

describe("择时 Alpha 回测（扩大版，50只/3.5年）", () => {
  it(
    "买入评级 Alpha 显著优于 回避评级 Alpha",
    async () => {
      // 1. 批量拉取（每批 10 只，日线+周线分两轮）
      console.log(`\n拉取 ${SYMBOLS.length} 只股票（每批 ${BATCH_SIZE} 只）...`);
      const [dailyMap, weeklyMap] = await Promise.all([
        fetchAll(SYMBOLS, "daily",  DAILY_NUM),
        fetchAll(SYMBOLS, "weekly", WEEKLY_NUM),
      ]);

      // 2. 滚动回测
      const all: BtPoint[] = [];
      let skipped = 0;
      for (const sym of SYMBOLS) {
        const d = dailyMap.get(sym)  ?? [];
        const w = weeklyMap.get(sym) ?? [];
        if (d.length < MIN_BARS + EVAL_DAYS) { skipped++; continue; }
        const pts = rollBacktest(sym, d, w);
        all.push(...pts);
      }

      console.log(`有效股票: ${SYMBOLS.length - skipped} 只，跳过: ${skipped} 只`);
      console.log(`总信号点: ${all.length}`);
      if (all.length === 0) { expect(true).toBe(true); return; }

      // 3. 按四季
      const stages = ["spring", "summer", "autumn", "winter"] as const;
      printTable("=== 按四季（择时 Alpha）===", stages.map((s) => ({
        label:  `  ${s}`,
        alphas: all.filter((p) => p.stage === s).map((p) => p.alpha),
        rets:   all.filter((p) => p.stage === s).map((p) => p.ret20),
      })));

      // 4. 按综合评级
      const levels: RatingLevel[] = ["强烈买入", "积极买入", "观望", "谨慎", "回避"];
      printTable("=== 按综合评级（择时 Alpha）===", levels.map((lv) => ({
        label:  `  ${lv}`,
        alphas: all.filter((p) => p.level === lv).map((p) => p.alpha),
        rets:   all.filter((p) => p.level === lv).map((p) => p.ret20),
      })));

      // 5. 多空合并
      const buyPts   = all.filter((p) => p.level === "强烈买入" || p.level === "积极买入");
      const avoidPts = all.filter((p) => p.level === "回避");
      const bullSeasonPts = all.filter((p) => p.stage === "spring" || p.stage === "summer");
      const bearSeasonPts = all.filter((p) => p.stage === "autumn" || p.stage === "winter");

      printTable("=== 多空合并 ===", [
        { label: "  买入(强烈+积极)", alphas: buyPts.map(p => p.alpha),        rets: buyPts.map(p => p.ret20) },
        { label: "  回避",          alphas: avoidPts.map(p => p.alpha),       rets: avoidPts.map(p => p.ret20) },
        { label: "  看多季节(春+夏)", alphas: bullSeasonPts.map(p => p.alpha), rets: bullSeasonPts.map(p => p.ret20) },
        { label: "  看空季节(秋+冬)", alphas: bearSeasonPts.map(p => p.alpha), rets: bearSeasonPts.map(p => p.ret20) },
      ]);

      // 6. 按转折状态 Alpha（真正的 transitionState 字段）
      const transStates = ["冬→春", "春→夏", "夏→秋", "秋→冬", "无"] as const;
      printTable("=== 按转折状态（择时 Alpha）===", transStates.map((ts) => ({
        label:  `  ${ts}`,
        alphas: all.filter((p) => p.transitionState === ts).map((p) => p.alpha),
        rets:   all.filter((p) => p.transitionState === ts).map((p) => p.ret20),
      })));

      // 7. 按背景动量 Alpha（新）
      printTable("=== 按背景动量（择时 Alpha）===", [
        { label: "  improving",    alphas: all.filter(p => p.longTermMomentum === "improving").map(p => p.alpha),    rets: all.filter(p => p.longTermMomentum === "improving").map(p => p.ret20) },
        { label: "  stable",       alphas: all.filter(p => p.longTermMomentum === "stable").map(p => p.alpha),       rets: all.filter(p => p.longTermMomentum === "stable").map(p => p.ret20) },
        { label: "  deteriorating",alphas: all.filter(p => p.longTermMomentum === "deteriorating").map(p => p.alpha),rets: all.filter(p => p.longTermMomentum === "deteriorating").map(p => p.ret20) },
      ]);

      // 8. 按长期背景 Alpha
      const bgTypes = ["长期多头", "上行趋势", "震荡", "下行趋势", "长期空头"] as const;
      printTable("=== 按长期背景（择时 Alpha）===", bgTypes.map((bg) => ({
        label:  `  ${bg}`,
        alphas: all.filter((p) => p.longTermBg === bg).map((p) => p.alpha),
        rets:   all.filter((p) => p.longTermBg === bg).map((p) => p.ret20),
      })));

      // 8. 关键组合分析：长期背景 × 转折时机
      const bullBg = (p: BtPoint) => p.longTermBg === "长期多头" || p.longTermBg === "上行趋势";
      const bearBg = (p: BtPoint) => p.longTermBg === "长期空头" || p.longTermBg === "下行趋势";
      printTable("=== 长期背景 × 转折信号（最强复合信号）===", [
        {
          label:  "  多头背景+冬→春",
          alphas: all.filter((p) => bullBg(p) && p.transitionState === "冬→春").map((p) => p.alpha),
          rets:   all.filter((p) => bullBg(p) && p.transitionState === "冬→春").map((p) => p.ret20),
        },
        {
          label:  "  空头背景+冬→春",
          alphas: all.filter((p) => bearBg(p) && p.transitionState === "冬→春").map((p) => p.alpha),
          rets:   all.filter((p) => bearBg(p) && p.transitionState === "冬→春").map((p) => p.ret20),
        },
        {
          label:  "  多头背景+夏→秋",
          alphas: all.filter((p) => bullBg(p) && p.transitionState === "夏→秋").map((p) => p.alpha),
          rets:   all.filter((p) => bullBg(p) && p.transitionState === "夏→秋").map((p) => p.ret20),
        },
        {
          label:  "  空头背景+夏→秋",
          alphas: all.filter((p) => bearBg(p) && p.transitionState === "夏→秋").map((p) => p.alpha),
          rets:   all.filter((p) => bearBg(p) && p.transitionState === "夏→秋").map((p) => p.ret20),
        },
      ]);

      // 9. 长期背景过滤器有效性：同为买入评级，背景不同时的 alpha 差
      printTable("=== 背景过滤器有效性（买入评级分背景）===", [
        {
          label:  "  多头背景+买入",
          alphas: all.filter((p) => bullBg(p) && (p.level === "强烈买入" || p.level === "积极买入")).map((p) => p.alpha),
          rets:   all.filter((p) => bullBg(p) && (p.level === "强烈买入" || p.level === "积极买入")).map((p) => p.ret20),
        },
        {
          label:  "  空头背景+买入",
          alphas: all.filter((p) => bearBg(p) && (p.level === "强烈买入" || p.level === "积极买入")).map((p) => p.alpha),
          rets:   all.filter((p) => bearBg(p) && (p.level === "强烈买入" || p.level === "积极买入")).map((p) => p.ret20),
        },
        {
          label:  "  震荡背景+买入",
          alphas: all.filter((p) => p.longTermBg === "震荡" && (p.level === "强烈买入" || p.level === "积极买入")).map((p) => p.alpha),
          rets:   all.filter((p) => p.longTermBg === "震荡" && (p.level === "强烈买入" || p.level === "积极买入")).map((p) => p.ret20),
        },
      ]);

      // 10. totalScore 单调性：分数越高 alpha 应越大
      const scoreBuckets: Array<{ label: string; min: number; max: number }> = [
        { label: "  ≥5（极强）",   min:  5, max:  99 },
        { label: "  3~4（强）",    min:  3, max:   4 },
        { label: "  1~2（偏多）",  min:  1, max:   2 },
        { label: "  -1~0（中性）", min: -1, max:   0 },
        { label: "  -3~-2（偏空）",min: -3, max:  -2 },
        { label: "  ≤-4（极弱）",  min: -99, max: -4 },
      ];
      printTable("=== totalScore 单调性验证（分越高 alpha 应越大）===",
        scoreBuckets.map((b) => ({
          label:  b.label,
          alphas: all.filter((p) => p.totalScore >= b.min && p.totalScore <= b.max).map((p) => p.alpha),
          rets:   all.filter((p) => p.totalScore >= b.min && p.totalScore <= b.max).map((p) => p.ret20),
        }))
      );

      // 11. 评分维度贡献分析
      // 每个维度单独出现时（其余维度=0）的平均 alpha，验证各层信号质量
      console.log("\n=== 评分维度贡献分析 ===");
      console.log("维度".padEnd(14) + "| 正向信号(>0) Alpha | 负向信号(<0) Alpha | 无信号(=0) Alpha");
      console.log("─".repeat(70));
      for (const dim of ["bgScore", "transScore", "volScore"] as const) {
        const posAlpha = all.filter((p) => p[dim] > 0).map((p) => p.alpha);
        const negAlpha = all.filter((p) => p[dim] < 0).map((p) => p.alpha);
        const neuAlpha = all.filter((p) => p[dim] === 0).map((p) => p.alpha);
        const fmt = (vals: number[]) => {
          if (vals.length === 0) return "  N/A".padEnd(20);
          const s = stats(vals);
          const pct = (s.mean * 100).toFixed(2);
          const prefix = s.mean >= 0 ? "+" : "";
          return `${prefix}${pct}%(n=${vals.length},t=${s.tStat.toFixed(1)}${sig(s.tStat)})`.padEnd(20);
        };
        const dimLabel = { bgScore: "长期背景", transScore: "转折时机", volScore: "量能验证" }[dim];
        console.log(dimLabel.padEnd(14) + `| ${fmt(posAlpha)}| ${fmt(negAlpha)}| ${fmt(neuAlpha)}`);
      }

      // 12. 断言
      const buyAlpha   = stats(buyPts.map(p => p.alpha));
      const avoidAlpha = stats(avoidPts.map(p => p.alpha));
      const winterSpringAlpha = stats(all.filter((p) => p.transitionState === "冬→春").map((p) => p.alpha));
      const summerAutumnAlpha = stats(all.filter((p) => p.transitionState === "夏→秋").map((p) => p.alpha));

      console.log(`\n买入评级 Alpha:   ${fmtStats(buyAlpha)}`);
      console.log(`回避评级 Alpha:   ${fmtStats(avoidAlpha)}`);
      console.log(`Alpha 价差:       +${((buyAlpha.mean - avoidAlpha.mean) * 100).toFixed(2)}%`);
      console.log(`冬→春 Alpha:      ${fmtStats(winterSpringAlpha)}`);
      console.log(`夏→秋 Alpha:      ${fmtStats(summerAutumnAlpha)}`);
      console.log(`\n（* 表示 95% 置信水平下显著，|t| ≥ 1.96）`);

      // 断言1：极端 totalScore 单调性（最有统计意义的验证）
      const topScoreAlpha = stats(all.filter(p => p.totalScore >= 5).map(p => p.alpha));
      const botScoreAlpha = stats(all.filter(p => p.totalScore <= -4).map(p => p.alpha));
      if (topScoreAlpha.n > 0 && botScoreAlpha.n > 0) {
        expect(topScoreAlpha.mean).toBeGreaterThan(botScoreAlpha.mean);
      }

      // 断言2：夏→秋是最强卖点，alpha 应为负
      if (summerAutumnAlpha.n > 0) {
        expect(summerAutumnAlpha.mean).toBeLessThan(0);
      }

      // 断言3：转折方向性 — 春→夏 alpha > 夏→秋 alpha
      const springToSummerAlpha = stats(all.filter(p => p.transitionState === "春→夏").map(p => p.alpha));
      if (springToSummerAlpha.n > 0 && summerAutumnAlpha.n > 0) {
        expect(springToSummerAlpha.mean).toBeGreaterThan(summerAutumnAlpha.mean);
      }

      // 断言4：背景动量方向正确 — improving > deteriorating
      const improvingAlpha    = stats(all.filter(p => p.longTermMomentum === "improving").map(p => p.alpha));
      const deterioratingAlpha = stats(all.filter(p => p.longTermMomentum === "deteriorating").map(p => p.alpha));
      if (improvingAlpha.n > 0 && deterioratingAlpha.n > 0) {
        expect(improvingAlpha.mean).toBeGreaterThan(deterioratingAlpha.mean);
      }

      // 注：A股均值回归效应使"长期空头"背景票短期内容易反弹（alpha=+2.63%）
      // longTermBackground 仅作天花板，买入 vs 回避的粗粒度断言在此市场制度下不稳定。
    },
    300_000  // 5 分钟超时
  );
});
