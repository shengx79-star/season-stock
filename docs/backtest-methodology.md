# 四季回测方法论 v2.0（Alpha 校正版）

## 为什么需要 Alpha 校正

直接用"20日后收益"作为评估指标有致命缺陷：

**反例**：
- 测试期恰好是牛市，大盘涨 20%
- 强烈买入信号出现时收益 +12%，回避信号出现时收益 +8%
- 结论看起来是"强烈买入 > 回避"，但两者都跑输大盘，模型根本没有择时能力

**正确做法**：
```
alpha = 信号出现时的20日收益 - 该只股票在整个测试期的平均20日收益
```

alpha > 0 表示：在这个信号下持仓，比随机任意时点买入该股票更好。
alpha 已经自动抵消了每只股票的趋势（贝塔），剩下的是纯粹的择时贡献。

---

## 核心算法

### Step 1：对每只股票，计算基准均值

```typescript
// 取该股票所有可能的入场点（从第 MIN_BARS 根开始，每 1 根一个点）
const allRets: number[] = [];
for (let i = MIN_BARS; i <= daily.length - EVAL_DAYS; i++) {
  const futClose = daily[i + EVAL_DAYS - 1]?.close;
  if (!futClose) continue;
  const ret = (futClose - daily[i - 1].close) / daily[i - 1].close;
  allRets.push(ret);
}
// 该股票的基准：随机入场的期望收益
const baseline = allRets.reduce((s, r) => s + r, 0) / allRets.length;
```

### Step 2：滚动窗口，每 5 日采一个测试点

```typescript
for (let i = MIN_BARS; i <= daily.length - EVAL_DAYS; i += STEP) {
  const hist   = daily.slice(0, i);          // 只用历史数据，无前瞻
  const curDate = hist[hist.length - 1].date;
  const wHist  = weekly.filter(w => w.date <= curDate);
  if (wHist.length < 15) continue;

  const cls    = classifyStock({ dailyBars: hist, weeklyBars: wHist });
  if (cls.stage === "unknown") continue;

  const rating = computeCompositeRating(cls, symbol);  // 传 symbol 以路由 HK 模型
  const futClose = daily[i + EVAL_DAYS - 1]?.close;
  if (!futClose) continue;

  const ret20 = (futClose - daily[i - 1].close) / daily[i - 1].close;
  const alpha = ret20 - baseline;  // ← 核心：减去股票基准

  // 记录所有字段，供后续分组分析
  points.push({ symbol, date: curDate, stage: cls.stage, alpha, ret20, ... });
}
```

### Step 3：分组统计（必须包含显著性检验）

```typescript
function stats(vals: number[]) {
  const n    = vals.length;
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const se   = Math.sqrt(variance / n);
  const tStat = se > 0 ? mean / se : 0;
  return {
    n,
    mean,                          // 平均 alpha
    se,                            // 标准误差
    ci95lo: mean - 1.96 * se,      // 95% 置信区间下限
    ci95hi: mean + 1.96 * se,      // 95% 置信区间上限
    tStat,                         // t 统计量
    significant: Math.abs(tStat) >= 1.96,  // |t| ≥ 1.96 → 95% 显著
    winRate: vals.filter(v => v > 0).length / n,
  };
}
```

**如何判断一个信号是否真实有效**：
- `|tStat| >= 1.96`：在 95% 置信水平下显著，标记 `*`
- `|tStat| >= 2.58`：在 99% 置信水平下显著，标记 `**`
- 样本 n < 30 的分组结果不可信，忽略或标注
- **重要**：某个分组的 alpha > 0 但 t < 1.96，不能说"这个信号有效"

---

## 参数配置

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| MIN_BARS | 150 | 回测起点，保证足够的周线数据（至少30根周线） |
| STEP | 5 | 每5个交易日取一个测试点（约每周一次） |
| EVAL_DAYS | 20 | 评估未来20个交易日的收益（约1个月） |
| 日线数量 | 750 | 约3年数据 |
| 周线数量 | ceil(750/5)+10 = 160 | 对应周线 |
| MIN_WEEKLY | 15 | 少于15根周线的测试点跳过 |

**注意**：MIN_BARS=150 而不是 60，因为需要足够的周线数据让 classifyStock() 的周线信号稳定。

---

## 分析维度（必测）

按以下维度分组，每组输出 stats()：

### A 股模型

1. **季节分组**：spring / summer / autumn / winter
   - 预期：alpha 排序 春/夏 > 冬 > 秋

2. **转折状态**：冬→春 / 春→夏 / 夏→秋 / 秋→冬 / 无
   - 预期：春→夏 alpha 显著为正（历史：+1.57%\*），夏→秋 显著为负（历史：-1.33%\*）

3. **综合评级**：强烈买入 / 积极买入 / 观望 / 谨慎 / 回避
   - 预期：评级越高 alpha 越大，至少两端显著

4. **totalScore 单调性**：≥5 / 3~4 / 1~2 / -1~0 / -3~-2 / ≤-4
   - 预期：≥5 > ≤-4，两端应显著

5. **长期背景动量**：improving / stable / deteriorating
   - 预期：improving > deteriorating（A股均值回归使静态背景反向，但动量转变有效）

6. **长期背景（静态）**：长期多头 / 上行趋势 / 震荡 / 下行趋势 / 长期空头
   - 注意：A股"长期空头"alpha 历史达 +2.63%\*（均值回归），不是错误，是A股特性

7. **量能维度**：OBV/MA20 信号（吸筹/>1.15 / 派发/<0.85 / 净流入 / 净流出）

8. **蓄力评分**：≥70 / 50~69 / 30~49 / <30
   - 预期：蓄力越高 alpha 越大（A股有效，港股无效或反向）

### 港股模型（额外维度）

港股模型完全独立（代码：`/^0[0-9]{4}$/` 检测），不要混入 A 股分析。

1. **季节分组**：预期 冬 > 春 > 夏 > 秋（方向与 A 股相反）
2. **转折状态**：预期 秋→冬 显著为正，春→夏 显著为负
3. **综合评级**：强烈买入 vs 回避 alpha 差距应 > 5%（历史差距 7%+）
4. **长期背景**：空头背景 alpha 应远大于多头背景（均值回归主导，历史差距约 4.5%）
5. **背景动量**：港股 improving 不一定有效（历史 alpha 反向），单独验证

---

## 输出格式（标准化）

每个分组表格必须包含：

```
分组       | 样本  | Alpha均值 | 95%CI | t值 | 显著 | 胜率
──────────────────────────────────────────────────────────
强烈买入   | 1443  | +4.29%   | [2.89%,5.69%] | t=6.0 | * | 56.3%
积极买入   | 1199  | +0.41%   | [-0.28%,1.11%] | t=1.2 |   | 46.0%
观望       | 2328  | -0.34%   | [-0.81%,0.14%] | t=-1.4|   | 44.7%
谨慎       | 1789  | +0.12%   | [-0.43%,0.67%] | t=0.4 |   | 48.0%
回避       | 787   | -2.74%   | [-3.52%,-1.97%]| t=-6.9| * | 36.3%
```

**必须展示**：
- n（样本数），判断结果可信度
- 95% CI，让人知道这个均值的不确定范围
- t 值 + 显著性标记
- 胜率（补充 alpha 信息）

**不要只展示**：平均值 + 胜率，没有置信区间无法判断是否有效

---

## 常见错误和陷阱

### 错误 1：用原始收益代替 alpha

```
❌ score = forward_20d_return                  # 包含市场贝塔
✅ score = forward_20d_return - stock_baseline  # 纯择时贡献
```

### 错误 2：前瞻偏差（Look-ahead Bias）

```
❌ hist = daily                                # 用了全部数据
✅ hist = daily.slice(0, i)                    # 只用截至当前的历史
✅ wHist = weekly.filter(w => w.date <= curDate)
```

### 错误 3：MIN_BARS 太低

MIN_BARS=60 时，周线只有12根，无法计算稳定的 MACD 周线信号（需要至少 26+9=35 根）。
建议 MIN_BARS=150（对应约 30 根周线）。

### 错误 4：n 太小的分组

n < 30 的分组标准误差很大，t 统计量不可信。应标注"样本不足"或合并分组。

### 错误 5：港股混用 A 股模型

港股代码（5位数字，0开头，如 00700）必须走独立的港股评级模型 `computeHKRating()`。
调用时传入 symbol：`computeCompositeRating(cls, symbol)` 会自动路由。

---

## 解读参考值（基于历史回测）

| 信号 | 市场 | Alpha | t 值 | 结论 |
|------|------|-------|------|------|
| 春→夏 转折 | A 股 | +1.57% | 2.1\* | 有效，最强买点 |
| 夏→秋 转折 | A 股 | -1.33% | -3.6\* | 有效，最强卖点 |
| 长期空头背景 | A 股 | +2.63% | 7.0\* | 有效（均值回归，非趋势） |
| 长期多头背景 | A 股 | -1.10% | -4.5\* | 有效（均值回归） |
| improving 动量 | A 股 | +0.13% | 0.4 | 不显著 |
| 强烈买入 | 港股 | +4.29% | 6.0\* | 有效 |
| 回避 | 港股 | -2.74% | -6.9\* | 有效 |
| 冬季 | 港股 | +0.64% | 2.7\* | 有效 |
| 春→夏 | 港股 | -1.85% | -3.2\* | 有效（反向） |
| 蓄力≥60 | 港股 | -0.95% | -2.3\* | 有效但反向（港股无效） |

> \* 表示 |t| ≥ 1.96，95% 置信水平下显著

---

## 参考实现

源码：`/Users/xusheng/Code/season-stock/src/test/classifierBacktest.test.ts`（A 股）
源码：`/Users/xusheng/Code/season-stock/src/test/hkBacktest.test.ts`（港股诊断）

运行：
```bash
npx vitest run src/test/classifierBacktest.test.ts --reporter=verbose
npx vitest run src/test/hkBacktest.test.ts --reporter=verbose
```

---

## 信号矩阵框架（Signal Matrix v1）

### 动机

497只/3年/58,149个信号点的全量回测掩盖了关键结构性差异：

- **同一信号在牛熊市方向可能相反**：春→夏在牛市可能 alpha > 0，在熊市 alpha < 0
- **板块轮动节奏不同**：金融秋→冬均值回归 vs 新能源秋→冬可能持续下跌
- **量能信号在熊市可能失效**：机构出货行为在熊市混淆 OBV 信号

### 三维分析框架

```
维度一：市场制度    →  bull（牛市）/ bear（熊市）/ sideways（震荡）
维度二：板块        →  金融 / 消费 / 医药 / 科技 / 新能源 / 周期 / 工业
维度三：信号类型    →  transitionState / stage / rating / obvSignal
```

每个 (市场制度 × 板块) 格子输出持有期衰减曲线：10d/20d/40d/80d/160d 的 alpha + t 值。

### 市场制度算法

无需外部指数，用股票池内各股票的 `longTermBackground` 分布计算：

```typescript
function computeMarketRegime(
  allPoints: BacktestPoint[],
  targetDate: string,
  windowDays = 5
): "bull" | "bear" | "sideways" {
  // 取 targetDate 前后 ±windowDays 内所有测试点的 longTermBackground
  const nearby = allPoints.filter(p =>
    Math.abs(dateDiffDays(p.date, targetDate)) <= windowDays
  );
  if (nearby.length < 20) return "sideways"; // 样本不足默认震荡

  const bullCount = nearby.filter(p =>
    p.longTermBg === "长期多头" || p.longTermBg === "上行趋势"
  ).length;
  const bearCount = nearby.filter(p =>
    p.longTermBg === "下行趋势" || p.longTermBg === "长期空头"
  ).length;
  const total = nearby.length;

  if (bullCount / total > 0.55) return "bull";
  if (bearCount / total > 0.55) return "bear";
  return "sideways";
}
```

**实现顺序**：先跑完所有股票取得测试点集合，再对每个日期计算 marketRegime，最后打标签。

### 板块标签

```typescript
// 读取 iCloud/stocktest/sector-map.json
const sectorMap: Record<string, string[]> = JSON.parse(
  fs.readFileSync("sector-map.json", "utf8")
);
// 反转为 symbol → sector 查找表
const symbolSector = new Map<string, string>();
for (const [sector, symbols] of Object.entries(sectorMap)) {
  if (sector.startsWith("_")) continue; // 跳过 _meta 等元信息
  for (const sym of symbols as string[]) {
    symbolSector.set(sym, sector);
  }
}
// 每个测试点打标签
const sector = symbolSector.get(symbol) ?? "unknown";
```

### MVP 三个核心问题

backtest-v5.ts 必须回答这三个问题，输出在 `crossRegimeComparison` 字段：

1. **春→夏 在牛市和熊市的 alpha 差异**
   - 期望：牛市 alpha ≥ 0，熊市 alpha < 0（当前统一评分 -1 可能过于保守或方向错误）
   - 如果成立：将春→夏评分改为制度感知（牛市 +1，熊市 -2 或 -3）

2. **秋→冬 在哪些板块最强**
   - 期望：金融/周期板块机构持仓集中，均值回归最强（80d alpha > 3%，t > 2）
   - 如果成立：为这些板块在秋→冬时额外加分（例如金融+0.5，周期+0.5）

3. **量能验证信号（OBV 吸筹）在不同制度下是否失效**
   - 期望：牛市吸筹信号显著正（t > 2），熊市不显著（t < 1.96）
   - 如果成立：熊市中量能层权重上限从 ±2 降至 ±1

### 输出格式规范

完整格式见：`iCloud/stocktest/signal-atlas-spec.json`

简要结构：
```json
{
  "version": "v1",
  "generated": "2026-06-01",
  "market": "A",
  "globalStats": { "byRating": { ... } },
  "cells": [
    {
      "marketRegime": "bull",
      "sector": "科技",
      "sampleSize": 3840,
      "topSignals": [
        {
          "dimension": "transitionState",
          "value": "冬→春",
          "decayCurve": {
            "20d": { "n": 312, "mean": 0.015, "tStat": 2.8, "significant": true, "winRate": 0.57 },
            "80d": { "n": 312, "mean": 0.034, "tStat": 3.4, "significant": true, "winRate": 0.61 }
          },
          "bestPeriod": "80d",
          "bestAlpha": 0.034,
          "bestTStat": 3.4
        }
      ],
      "worstSignals": [ ... ]
    }
  ],
  "crossRegimeComparison": { ... }
}
```

筛选标准：`n ≥ 100`，`|tStat| ≥ 1.96`（topSignals 要求 mean > 0，worstSignals 要求 mean < 0）

### 迭代更新循环

```
[Hermes] 每月 1 日运行 backtest-v5.ts
       ↓
产出 signal-atlas.json + bt-matrix-report.txt（iCloud/stocktest/）
       ↓
[Claude Code] 读取 atlas，与上次对比：
  · 哪些信号 tStat 下降 > 1.0 → 减权或移除
  · 新发现信号 tStat ≥ 2.5 且 n ≥ 200 → 纳入评分
  · 市场制度切换时检查信号方向是否需要翻转
       ↓
更新 ratingEngine.ts → git commit → Hermes git pull → 验证回测
```

**触发更新的阈值**：
- 信号失效：新数据中 tStat 下降 > 1.0（可能已失效）
- 新信号纳入：tStat ≥ 2.5 且 n ≥ 200（统计上稳健）
- 方向翻转：同一信号在牛/熊市 alpha 符号相反且两端均显著

### backtest-v5.ts 参数配置

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| MIN_BARS | 150 | 同 V4 |
| STEP | 10 | 降频以支持更多持有期 |
| EVAL_PERIODS | [10, 20, 40, 80, 160] | 2/4/8/16/32 周衰减曲线 |
| MIN_CELL_SAMPLE | 100 | 低于此值的格子不输出信号 |
| REGIME_WINDOW | 5 | 计算市场制度时的日期窗口（±5 交易日）|

**注意**：step=10 时，160d 持有期仍有约 16x 重叠，t 检验 SE 可能低估。在报告中标注此风险，但不纠正（与竞争基准一致）。
