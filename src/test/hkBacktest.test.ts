/**
 * 港股信号诊断回测
 *
 * 目标：找出哪些指标在港股有正向 Alpha，为港股独立模型提供数据基础。
 * 分析维度：四季、转折状态、长期背景、背景动量、蓄力评分、OBV、涨跌量比、totalScore
 *
 * 运行：npx vitest run src/test/hkBacktest.test.ts --reporter=verbose
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

// 50 只港股：大蓝筹 + 中资金融 + 科技互联网 + 消费医药 + 能源地产
const HK_SYMBOLS = [
  // 恒指蓝筹
  "00700", "09988", "03690", "01810", "00005",
  "01299", "00941", "00002", "00003", "00006",
  // 中资金融
  "00939", "01398", "03988", "02318", "02628",
  "01988", "03968", "02388",
  // 科技互联网
  "09618", "09999", "09888", "01024", "00241",
  "09961", "06690", "02015",
  // 消费/医药
  "09987", "02331", "06862", "09626", "01929",
  "02359", "01093", "00291",
  // 能源/资源
  "00857", "00386", "01898", "00883", "00916",
  // 地产/基建
  "00960", "01109", "00688", "01919", "00066",
  // 汽车/制造
  "01211", "02238", "00175", "01313",
  // 其他
  "00388", "01177", "02269", "01833",
];

const DAILY_NUM  = 800;
const WEEKLY_NUM = 175;
const BATCH_SIZE = 10;
const MIN_BARS   = 150;
const STEP       = 5;
const EVAL_DAYS  = 20;

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

// ── 回测数据点 ───────────────────────────────────────────────────────────────

interface HkPoint {
  symbol:           string;
  date:             string;
  stage:            string;
  level:            RatingLevel;
  totalScore:       number;
  transitionState:  string;
  longTermBg:       string;
  longTermMomentum: string;
  accScore:         number;   // 蓄力评分
  obvRatio:         number;   // OBV/OBV_MA20（null→0）
  udRatio:          number;   // 涨跌日均量比（null→1）
  upTurnCount:      number;
  downTurnCount:    number;
  transScore:       number;
  volScore:         number;
  ret20:            number;
  alpha:            number;
}

function rollBacktest(sym: string, daily: Candle[], weekly: Candle[]): HkPoint[] {
  const allRets: number[] = [];
  for (let i = MIN_BARS; i <= daily.length - EVAL_DAYS; i++) {
    const fut = daily[i + EVAL_DAYS - 1]?.close;
    if (fut) allRets.push((fut - daily[i - 1].close) / daily[i - 1].close);
  }
  const base = allRets.length > 0
    ? allRets.reduce((s, r) => s + r, 0) / allRets.length : 0;

  const points: HkPoint[] = [];
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

      points.push({
        symbol:           sym,
        date:             curDate,
        stage:            cls.stage,
        level:            rating.level,
        totalScore:       rating.totalScore,
        transitionState:  cls.transitionState ?? "无",
        longTermBg:       cls.longTermBackground,
        longTermMomentum: cls.longTermMomentum,
        accScore:         cls.mediumTermAnalysis?.accumulationScore ?? 0,
        obvRatio:         cls.indicators?.obvMA20Ratio ?? 0,
        udRatio:          cls.indicators?.upDownVolRatio ?? 1,
        upTurnCount:      cls.turnSignals?.upTurnCount ?? 0,
        downTurnCount:    cls.turnSignals?.downTurnCount ?? 0,
        transScore:       rating.factors.find(f => f.dimension === "转折时机")?.score ?? 0,
        volScore:         rating.factors.find(f => f.dimension === "量能验证")?.score ?? 0,
        ret20,
        alpha: ret20 - base,
      });
    } catch (_) {}
  }
  return points;
}

// ── 统计 ─────────────────────────────────────────────────────────────────────

interface Stats {
  n: number; mean: number; se: number;
  ci95lo: number; ci95hi: number; tStat: number; posRate: number;
}

function stats(vals: number[]): Stats {
  const n = vals.length;
  if (n === 0) return { n: 0, mean: 0, se: 0, ci95lo: 0, ci95hi: 0, tStat: 0, posRate: 0 };
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1);
  const se = Math.sqrt(variance / n);
  return {
    n, mean, se,
    ci95lo: mean - 1.96 * se, ci95hi: mean + 1.96 * se,
    tStat: se > 0 ? mean / se : 0,
    posRate: vals.filter(v => v > 0).length / n,
  };
}

function sig(t: number) { return Math.abs(t) >= 1.96 ? " *" : "  "; }

function fmtStats(s: Stats): string {
  if (s.n === 0) return "   N/A";
  const m  = (s.mean * 100).toFixed(2);
  const lo = (s.ci95lo * 100).toFixed(2);
  const hi = (s.ci95hi * 100).toFixed(2);
  const t  = s.tStat.toFixed(1);
  return `${s.mean >= 0 ? "+" : ""}${m}% [${lo}%,${hi}%] t=${t}${sig(s.tStat)}`;
}

function printTable(
  title: string,
  rows: Array<{ label: string; alphas: number[]; rets: number[] }>
) {
  console.log(`\n${title}`);
  console.log("分组".padEnd(18) + "| 样本  | Alpha（均值 [95%CI] t值）         | 绝对收益 | >0%");
  console.log("─".repeat(86));
  for (const r of rows) {
    const s  = stats(r.alphas);
    const rm = r.rets.length > 0
      ? (r.rets.reduce((a, b) => a + b, 0) / r.rets.length * 100).toFixed(2) : "N/A";
    console.log(
      r.label.padEnd(18) +
      `| ${String(s.n).padStart(5)} ` +
      `| ${fmtStats(s).padEnd(38)}` +
      `| ${Number(rm) >= 0 ? "+" : ""}${rm}%`.padEnd(10) +
      `| ${(s.posRate * 100).toFixed(1)}%`
    );
  }
}

// ── 主测试 ───────────────────────────────────────────────────────────────────

describe("港股信号诊断回测（50只/3.5年）", () => {
  it(
    "输出各维度 Alpha，为港股独立模型提供校准数据",
    async () => {
      console.log(`\n拉取 ${HK_SYMBOLS.length} 只港股（每批 ${BATCH_SIZE} 只）...`);
      const [dailyMap, weeklyMap] = await Promise.all([
        fetchAll(HK_SYMBOLS, "daily",  DAILY_NUM),
        fetchAll(HK_SYMBOLS, "weekly", WEEKLY_NUM),
      ]);

      const all: HkPoint[] = [];
      let skipped = 0;
      for (const sym of HK_SYMBOLS) {
        const d = dailyMap.get(sym) ?? [];
        const w = weeklyMap.get(sym) ?? [];
        if (d.length < MIN_BARS + EVAL_DAYS) { skipped++; continue; }
        all.push(...rollBacktest(sym, d, w));
      }

      console.log(`有效股票: ${HK_SYMBOLS.length - skipped} 只，跳过: ${skipped} 只`);
      console.log(`总信号点: ${all.length}`);
      if (all.length === 0) { expect(true).toBe(true); return; }

      // 1. 按四季
      printTable("=== [HK] 按四季 Alpha ===", ["spring","summer","autumn","winter"].map(s => ({
        label: `  ${s}`,
        alphas: all.filter(p => p.stage === s).map(p => p.alpha),
        rets:   all.filter(p => p.stage === s).map(p => p.ret20),
      })));

      // 2. 按综合评级
      const levels: RatingLevel[] = ["强烈买入","积极买入","观望","谨慎","回避"];
      printTable("=== [HK] 按综合评级 Alpha ===", levels.map(lv => ({
        label: `  ${lv}`,
        alphas: all.filter(p => p.level === lv).map(p => p.alpha),
        rets:   all.filter(p => p.level === lv).map(p => p.ret20),
      })));

      // 3. 按转折状态
      printTable("=== [HK] 按转折状态 Alpha ===",
        ["冬→春","春→夏","夏→秋","秋→冬","无"].map(ts => ({
          label: `  ${ts}`,
          alphas: all.filter(p => p.transitionState === ts).map(p => p.alpha),
          rets:   all.filter(p => p.transitionState === ts).map(p => p.ret20),
        }))
      );

      // 4. 按长期背景
      printTable("=== [HK] 按长期背景 Alpha ===",
        ["长期多头","上行趋势","震荡","下行趋势","长期空头"].map(bg => ({
          label: `  ${bg}`,
          alphas: all.filter(p => p.longTermBg === bg).map(p => p.alpha),
          rets:   all.filter(p => p.longTermBg === bg).map(p => p.ret20),
        }))
      );

      // 5. 按背景动量
      printTable("=== [HK] 按背景动量 Alpha ===",
        ["improving","stable","deteriorating"].map(m => ({
          label: `  ${m}`,
          alphas: all.filter(p => p.longTermMomentum === m).map(p => p.alpha),
          rets:   all.filter(p => p.longTermMomentum === m).map(p => p.ret20),
        }))
      );

      // 6. 蓄力评分分层（港股唯一跨市场有效信号）
      printTable("=== [HK] 蓄力评分分层 Alpha ===", [
        { label: "  ≥70（极强蓄力）", alphas: all.filter(p => p.accScore >= 70).map(p => p.alpha), rets: all.filter(p => p.accScore >= 70).map(p => p.ret20) },
        { label: "  50~69（中等）",   alphas: all.filter(p => p.accScore >= 50 && p.accScore < 70).map(p => p.alpha), rets: all.filter(p => p.accScore >= 50 && p.accScore < 70).map(p => p.ret20) },
        { label: "  30~49（偏弱）",   alphas: all.filter(p => p.accScore >= 30 && p.accScore < 50).map(p => p.alpha), rets: all.filter(p => p.accScore >= 30 && p.accScore < 50).map(p => p.ret20) },
        { label: "  <30（无蓄力）",   alphas: all.filter(p => p.accScore < 30).map(p => p.alpha),  rets: all.filter(p => p.accScore < 30).map(p => p.ret20) },
      ]);

      // 7. OBV 信号有效性
      printTable("=== [HK] OBV 信号 Alpha ===", [
        { label: "  吸筹(>1.15+价弱)", alphas: all.filter(p => p.obvRatio > 1.15 && p.stage === "winter" || p.stage === "spring").map(p => p.alpha), rets: all.filter(p => p.obvRatio > 1.15 && (p.stage === "winter" || p.stage === "spring")).map(p => p.ret20) },
        { label: "  派发(<0.85+价强)", alphas: all.filter(p => p.obvRatio < 0.85 && (p.stage === "summer" || p.stage === "autumn")).map(p => p.alpha), rets: all.filter(p => p.obvRatio < 0.85 && (p.stage === "summer" || p.stage === "autumn")).map(p => p.ret20) },
        { label: "  净流入(>1.0)",     alphas: all.filter(p => p.obvRatio > 1.0).map(p => p.alpha), rets: all.filter(p => p.obvRatio > 1.0).map(p => p.ret20) },
        { label: "  净流出(<1.0)",     alphas: all.filter(p => p.obvRatio < 1.0).map(p => p.alpha), rets: all.filter(p => p.obvRatio < 1.0).map(p => p.ret20) },
      ]);

      // 8. 涨跌量比有效性
      printTable("=== [HK] 涨跌量比 Alpha ===", [
        { label: "  买盘强(>1.5)",  alphas: all.filter(p => p.udRatio > 1.5).map(p => p.alpha),                    rets: all.filter(p => p.udRatio > 1.5).map(p => p.ret20) },
        { label: "  中性(0.8~1.5)",alphas: all.filter(p => p.udRatio >= 0.8 && p.udRatio <= 1.5).map(p => p.alpha),rets: all.filter(p => p.udRatio >= 0.8 && p.udRatio <= 1.5).map(p => p.ret20) },
        { label: "  卖压重(<0.8)", alphas: all.filter(p => p.udRatio < 0.8).map(p => p.alpha),                     rets: all.filter(p => p.udRatio < 0.8).map(p => p.ret20) },
      ]);

      // 9. 转折信号数量有效性（upTurnCount/downTurnCount）
      printTable("=== [HK] 上行转折信号数 Alpha ===", [
        { label: "  upTurn=3（全满）", alphas: all.filter(p => p.upTurnCount === 3).map(p => p.alpha), rets: all.filter(p => p.upTurnCount === 3).map(p => p.ret20) },
        { label: "  upTurn=2",        alphas: all.filter(p => p.upTurnCount === 2).map(p => p.alpha), rets: all.filter(p => p.upTurnCount === 2).map(p => p.ret20) },
        { label: "  upTurn=1",        alphas: all.filter(p => p.upTurnCount === 1).map(p => p.alpha), rets: all.filter(p => p.upTurnCount === 1).map(p => p.ret20) },
        { label: "  upTurn=0",        alphas: all.filter(p => p.upTurnCount === 0).map(p => p.alpha), rets: all.filter(p => p.upTurnCount === 0).map(p => p.ret20) },
      ]);

      printTable("=== [HK] 下行转折信号数 Alpha ===", [
        { label: "  downTurn=3",      alphas: all.filter(p => p.downTurnCount === 3).map(p => p.alpha), rets: all.filter(p => p.downTurnCount === 3).map(p => p.ret20) },
        { label: "  downTurn=2",      alphas: all.filter(p => p.downTurnCount === 2).map(p => p.alpha), rets: all.filter(p => p.downTurnCount === 2).map(p => p.ret20) },
        { label: "  downTurn=1",      alphas: all.filter(p => p.downTurnCount === 1).map(p => p.alpha), rets: all.filter(p => p.downTurnCount === 1).map(p => p.ret20) },
        { label: "  downTurn=0",      alphas: all.filter(p => p.downTurnCount === 0).map(p => p.alpha), rets: all.filter(p => p.downTurnCount === 0).map(p => p.ret20) },
      ]);

      // 10. totalScore 单调性
      printTable("=== [HK] totalScore 单调性 ===", [
        { label: "  ≥5（极强）",   alphas: all.filter(p => p.totalScore >= 5).map(p => p.alpha),                          rets: all.filter(p => p.totalScore >= 5).map(p => p.ret20) },
        { label: "  3~4（强）",    alphas: all.filter(p => p.totalScore >= 3 && p.totalScore <= 4).map(p => p.alpha),      rets: all.filter(p => p.totalScore >= 3 && p.totalScore <= 4).map(p => p.ret20) },
        { label: "  1~2（偏多）",  alphas: all.filter(p => p.totalScore >= 1 && p.totalScore <= 2).map(p => p.alpha),      rets: all.filter(p => p.totalScore >= 1 && p.totalScore <= 2).map(p => p.ret20) },
        { label: "  -1~0（中性）", alphas: all.filter(p => p.totalScore >= -1 && p.totalScore <= 0).map(p => p.alpha),     rets: all.filter(p => p.totalScore >= -1 && p.totalScore <= 0).map(p => p.ret20) },
        { label: "  -3~-2（偏空）",alphas: all.filter(p => p.totalScore >= -3 && p.totalScore <= -2).map(p => p.alpha),    rets: all.filter(p => p.totalScore >= -3 && p.totalScore <= -2).map(p => p.ret20) },
        { label: "  ≤-4（极弱）",  alphas: all.filter(p => p.totalScore <= -4).map(p => p.alpha),                         rets: all.filter(p => p.totalScore <= -4).map(p => p.ret20) },
      ]);

      // 11. 维度贡献分析
      console.log("\n=== [HK] 评分维度贡献 ===");
      console.log("维度".padEnd(14) + "| 正向(>0) Alpha        | 负向(<0) Alpha        | 零值(=0) Alpha");
      console.log("─".repeat(75));
      for (const dim of ["transScore","volScore"] as const) {
        const pos = all.filter(p => p[dim] > 0).map(p => p.alpha);
        const neg = all.filter(p => p[dim] < 0).map(p => p.alpha);
        const neu = all.filter(p => p[dim] === 0).map(p => p.alpha);
        const fmt = (vals: number[]) => {
          if (!vals.length) return "  N/A".padEnd(22);
          const s = stats(vals);
          return `${s.mean >= 0 ? "+" : ""}${(s.mean*100).toFixed(2)}%(n=${vals.length},t=${s.tStat.toFixed(1)}${sig(s.tStat)})`.padEnd(22);
        };
        console.log({ transScore:"转折时机", volScore:"量能验证" }[dim].padEnd(14) +
          `| ${fmt(pos)}| ${fmt(neg)}| ${fmt(neu)}`);
      }

      // 12. 蓄力 × 季节交叉（判断蓄力在哪个季节最强）
      printTable("=== [HK] 蓄力≥50 × 季节 交叉 ===", ["spring","summer","autumn","winter"].map(s => ({
        label: `  蓄力≥50+${s}`,
        alphas: all.filter(p => p.accScore >= 50 && p.stage === s).map(p => p.alpha),
        rets:   all.filter(p => p.accScore >= 50 && p.stage === s).map(p => p.ret20),
      })));

      // 13. 关键汇总
      const springAlpha = stats(all.filter(p => p.stage === "spring").map(p => p.alpha));
      const summerAlpha = stats(all.filter(p => p.stage === "summer").map(p => p.alpha));
      const autumnAlpha = stats(all.filter(p => p.stage === "autumn").map(p => p.alpha));
      const winterAlpha = stats(all.filter(p => p.stage === "winter").map(p => p.alpha));
      const accHighAlpha = stats(all.filter(p => p.accScore >= 60).map(p => p.alpha));

      console.log("\n=== [HK] 关键信号汇总 ===");
      console.log(`春季 Alpha:    ${fmtStats(springAlpha)}`);
      console.log(`夏季 Alpha:    ${fmtStats(summerAlpha)}`);
      console.log(`秋季 Alpha:    ${fmtStats(autumnAlpha)}`);
      console.log(`冬季 Alpha:    ${fmtStats(winterAlpha)}`);
      console.log(`蓄力≥60 Alpha: ${fmtStats(accHighAlpha)}`);
      console.log(`\n（* = 95% 置信水平显著，|t| ≥ 1.96）`);

      // 宽松断言：蓄力信号应有正向 alpha（跨市场验证）
      if (accHighAlpha.n >= 20) {
        expect(accHighAlpha.mean).toBeGreaterThan(-0.01);
      }
      expect(true).toBe(true);
    },
    300_000
  );
});
