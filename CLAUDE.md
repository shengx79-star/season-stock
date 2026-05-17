# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
npm run dev          # 启动 Vite 开发服务器，端口 8080
npm run build        # 生产构建
npm run lint         # 运行 ESLint
npm run test         # 运行 Vitest（单次）
npm run test:watch   # 运行 Vitest（监听模式）
npx vitest run src/test/positionEngine.test.ts  # 运行单个测试文件
```

## 项目概述

面向 A 股市场的股票持仓管理与技术分析 Web 应用。基于 20+ 技术指标将股票划分为"四季"周期（春/夏/秋/冬），管理持仓头寸，并生成操作建议。

**技术栈**：React 18 + TypeScript、Vite、Tailwind CSS + shadcn/ui、React Router v6、TanStack Query、Supabase（PostgreSQL + Edge Functions）、Recharts。

## 架构

### 页面（`src/pages/`）

- **`Index.tsx`** — 股票池管理：按代码/名称/板块/拼音搜索，按季节筛选，添加/移除股票
- **`Portfolio.tsx`** — 持仓管理与分析：查看/编辑持仓、组合级市场状态、操作建议
- **`Review.tsx`** — 回测复盘：加载历史 `position_snapshots`，拉取后续 K 线，评估操作准确率（正确/错误/中性），提示参数优化方向
- **`Auth.tsx`** — Google OAuth 登录页（受 `AuthGuard` 组件保护）

### 核心业务逻辑（`src/lib/`）

**`stockClassifier.ts`** — 四季分类引擎：
- 计算 4 组评分向量（TREND、TURN、EXTENSION、WEEKLY），各自贡献春/夏/秋/冬得分
- 应用门控规则（春/秋抑制）确定主导季节
- 输出：`stage`、`confidence`（0–100）、`seasonScore`（温度 0–100）、详细 `scores` 分解
- 需要 35+ 根日线 + 35+ 根周线

**`positionEngine.ts`** — 持仓管理引擎：
- 四层结构：市场状态 → 个股目标仓位 → 建仓质量门槛 → 风险预算
- 核心函数：`computePortfolio(totalAssets, defaultQuotaValue, inputs, classifications, equityPeak?, marketClassifications?)`
  - 第 6 参数 `marketClassifications`：传入全池分类用于计算市场状态；第 4 参数只传组合内个股
  - `defaultQuotaValue` = `totalAssets × defaultQuotaPct / 100`（来自 `portfolio_config`，默认 10%）
- 夏天股票采用**双桶**结构：趋势桶（主仓）+ 突破桶（副仓）
- 市场温度公式：`10×冬占比 + 40×春占比 + 60×秋占比 + 80×夏占比`
- 辅助导出：`computeATR20()`、`computeATREnvFactor()`、`computeADV20Value()`
- 操作类型：`enter / add / hold / reduce / exit_autumn / take_profit / force_exit`

### 数据流

1. `useStockPool` — 从 Supabase `stock_pool` 表拉取股票列表（按 `user_id` 隔离）
2. `useStockClassifications` — 通过 `fetch-kline` Edge Function 或 `alltickService.ts` 拉取 K 线，失败时降级为 mock 数据
3. `stockClassifier.ts` — 将原始 OHLCV K 线处理为四季分类结果
4. `usePortfolio` — 从 Supabase `positions` + `portfolio_config` 表拉取持仓（按用户隔离）
5. `positionEngine.ts` — 合并分类结果 + 持仓 → 操作建议
6. `useRealtimePrices` — 在 A 股交易时段轮询腾讯行情 API 获取实时报价（每批 ≤50 只）；Index 和 Portfolio 页均使用
7. `useTransactions` — `transactions` 表的增删改查；写入买入/加仓/减仓时自动更新关联持仓；清仓类操作自动删除持仓记录
8. `usePositionSnapshots` — 保存/读取 `position_snapshots`，供 Review 复盘页使用

### Supabase 后端

所有用户相关表均通过 `user_id` 实施 RLS（Google OAuth，由 `useAuth` Hook + `AuthGuard` 组件保护页面）。

- **`stock_pool`**：`(user_id, symbol)` 联合主键，名称、价格、涨跌幅、季节、板块、PE、市值、`in_portfolio` 标志
- **`positions`**：个股持仓 — 成本价、持股数、配额价值、历史最高收盘价、行业、题材群、流动性等级
- **`portfolio_config`**：每用户单行 — `total_assets`、`default_quota_pct`（默认 10%，用于计算 `defaultQuotaValue`）
- **`transactions`**：交易记录 — 类型、价格、股数、金额、日期、备注；按 `(user_id, symbol)` 索引
- **`position_snapshots`**：时间点快照供 Review 复盘使用 — 操作、置信度、季节、价格、快照时刻盈亏
- Edge Function **`fetch-kline`**：代理腾讯财经 API（`web.ifzq.gtimg.cn`）获取 OHLCV K 线，处理 GBK 编码
- Edge Function **`lookup-stock`**：通过东方财富 API 搜索股票，通过腾讯 API 查询报价
- **`alltickService.ts`**：备用 K 线数据源（直连东方财富）；Review 页面使用

### UI 规范

- 季节颜色以 CSS HSL 变量定义在 `tailwind.config.ts`：`--spring`、`--summer`、`--autumn`、`--winter`
- **重要**：`--summer` = hue 0 = **红色**（中国惯例：红色代表上涨）。盈亏显示禁止使用 `--summer`/`--winter`，应使用 `text-green-500` / `text-red-500`
- 市场标签（沪/深/港/美/日/韩）及其 Tailwind 颜色类定义在 `src/lib/marketDetect.ts`
- A 股交易时段判断与轮询间隔逻辑在 `src/lib/marketHours.ts`
- 组件使用 `src/components/ui/` 中的 shadcn/ui 基础组件
- 路径别名 `@/` 指向 `src/`
- TypeScript 配置 `strictNullChecks=false`、`noImplicitAny=false`，无需冗余的空值判断
