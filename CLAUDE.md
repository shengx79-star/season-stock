# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server on port 8080
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run Vitest tests (single run)
npm run test:watch   # Run Vitest in watch mode
npx vitest run src/test/positionEngine.test.ts  # Run a single test file
```

## Project Overview

A stock portfolio management and technical analysis web app for the Chinese stock market. It classifies stocks into a "four seasons" cycle (Spring/Summer/Autumn/Winter) based on 20+ technical indicators, manages portfolio positions, and generates action recommendations.

**Stack**: React 18 + TypeScript, Vite, Tailwind CSS + shadcn/ui, React Router v6, TanStack Query, Supabase (PostgreSQL + edge functions), Recharts.

## Architecture

### Two Main Pages

- **`src/pages/Index.tsx`** — Stock discovery & pool management: search by code/name/sector/pinyin, filter by season, add/remove stocks from pool
- **`src/pages/Portfolio.tsx`** — Position management & analytics: view/edit positions, portfolio-level market regime, action recommendations

### Core Business Logic (`src/lib/`)

**`stockClassifier.ts`** — Four-seasons classification engine:
- Computes 4 score vectors (TREND, TURN, EXTENSION, WEEKLY), each contributing spring/summer/autumn/winter scores
- Applies gating rules (spring/autumn suppression) to determine dominant season
- Outputs: `stage`, `confidence` (0–100), `seasonScore` (temperature 0–100), detailed `scores` breakdown
- Uses 35+ daily bars + 35+ weekly bars

**`positionEngine.ts`** — Portfolio position management:
- Four layers: Market regime → per-stock target → setup quality gate → risk budget
- Key function: `computePortfolio(totalAssets, defaultQuotaValue, inputs, classifications, equityPeak?, marketClassifications?)`
  - 6th param `marketClassifications`: pass all-pool classifications for market regime calculation; 4th param is portfolio-only stocks for per-stock logic
  - `defaultQuotaValue` is hardcoded `100000` (¥10万) in Portfolio.tsx
- Market temperature formula: `10×winterShare + 40×springShare + 60×autumnShare + 80×summerShare`
- Helper exports: `computeATR20()`, `computeATREnvFactor()`, `computeADV20Value()`
- Actions: `enter / add / hold / reduce / exit_autumn / take_profit / force_exit`

### Data Flow

1. `useStockPool` — fetches stock list from Supabase `stock_pool` table
2. `useStockClassifications` — fetches K-line data via `fetch-kline` edge function, falls back to mock data
3. `stockClassifier.ts` — processes raw OHLCV candles into season classification
4. `usePortfolio` — fetches positions from Supabase `positions` + `portfolio_config` tables
5. `positionEngine.ts` — combines classifications + positions → recommendations

### Supabase Backend

- **`stock_pool`**: Symbol (PK), name, price, change, season, sector, pe, market cap, `in_portfolio` flag
- **`positions`**: Per-stock holdings — cost basis, shares, quota value, highest close, industry, theme cluster, liquidity level
- **`portfolio_config`**: Single row — total_assets, default_quota_pct (quota_pct currently unused; app uses hardcoded ¥10万)
- All tables use public RLS (no auth required)
- Edge function **`fetch-kline`**: proxies Tencent Finance API (`web.ifzq.gtimg.cn`) for OHLCV K-line data; handles GBK encoding
- Edge function **`lookup-stock`**: searches stocks via EastMoney API, looks up quotes via Tencent API

### UI Conventions

- Season colors defined as CSS HSL variables in `tailwind.config.ts`: `--spring`, `--summer`, `--autumn`, `--winter`
- **Critical**: `--summer` = hue 0 = **RED** (Chinese convention: red = bullish). Never use `--summer`/`--winter` for profit/loss display. Use `text-green-500` / `text-red-500` for P&L colors instead.
- Components use shadcn/ui primitives from `src/components/ui/`
- Path alias `@/` maps to `src/`
- TypeScript config has `strictNullChecks=false` and `noImplicitAny=false` — avoid redundant null guards
