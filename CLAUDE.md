# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server on port 8080
npm run build        # Production build
npm run lint         # Run ESLint
npm run test         # Run Vitest tests (single run)
npm run test:watch   # Run Vitest in watch mode
```

## Project Overview

A stock portfolio management and technical analysis web app for the Chinese stock market. It classifies stocks into a "four seasons" cycle (Spring/Summer/Autumn/Winter) based on 20+ technical indicators, manages portfolio positions, and generates action recommendations.

**Stack**: React 18 + TypeScript, Vite, Tailwind CSS + shadcn/ui, React Router v6, TanStack Query, Supabase (PostgreSQL + edge functions), Recharts, React Hook Form + Zod.

## Architecture

### Two Main Pages

- **`src/pages/Index.tsx`** — Stock discovery & pool management: search by code/name/sector/pinyin, filter by season, add/remove stocks from pool
- **`src/pages/Portfolio.tsx`** — Position management & analytics: view/edit positions, portfolio-level market regime, action recommendations

### Core Business Logic (`src/lib/`)

**`stockClassifier.ts`** — Four-seasons classification engine (active V2 rewrite per `.lovable/plan.md`):
- Computes 4 score vectors (TREND, TURN, EXTENSION, WEEKLY), each contributing spring/summer/autumn/winter scores
- Applies gating rules (spring/autumn suppression) to determine dominant season
- Outputs: `stage`, `confidence` (0-1 scaled to 0-100), `seasonScore` (temperature 0-100), detailed `scores` breakdown
- Uses 35+ daily bars + 35+ weekly bars from `alltickService`

**`positionEngine.ts`** — Portfolio position management:
- Three layers: Market regime → per-stock target position → action recommendation
- Market regime categories: healthy bull, overheated, early recovery, severe winter, etc.
- Actions: enter / add / hold / reduce / exit / take_profit / force_exit
- Uses ATR volatility, cost basis, highest close, industry/theme clustering, liquidity level

### Data Flow

1. `useStockPool` hook fetches the stock list from Supabase `stock_pool` table
2. `useStockClassifications` hook fetches K-line data via `alltickService` (Supabase edge function `fetch-kline` → Alltick API), falls back to mock data
3. `stockClassifier.ts` processes raw OHLCV candles into season classification
4. `usePortfolio` hook fetches positions from Supabase `positions` table + `portfolio_config`
5. `positionEngine.ts` combines classifications + positions → recommendations

### Supabase Backend

- **`stock_pool`**: Symbol (PK), name, price, change, season, sector, pe, market cap, `in_portfolio` flag
- **`positions`**: Per-stock holdings — position value, cost basis, shares, quota value, highest close, industry, theme cluster, liquidity level
- **`portfolio_config`**: Single row — total_assets, default_quota_pct
- All tables use public RLS (no auth required)
- Edge function `fetch-kline`: proxies Alltick API for K-line data

### Classification V2 Rewrite Status

`.lovable/plan.md` documents a planned rewrite of `stockClassifier.ts` to match the V2 technical spec. Key differences from current implementation:
- MA alignment scoring: 0-3 scale instead of boolean
- Add MA5/20 crossover detection alongside existing MA5/14
- Turn count: only 3 signals (MA cross + MACD cross + price cross MA20), remove RSI/KDJ contributions
- Spring/autumn gating: demote to runner-up score instead of -Infinity
- Confidence formula: `round((0.5×strength + 0.5×separation) × 100) / 100`
- New `seasonScore` field: winter=10, spring=40, summer=80, autumn=60

### UI Conventions

- Season colors defined as CSS HSL variables in `tailwind.config.ts`: `--spring`, `--summer`, `--autumn`, `--winter` with `-light` and `-foreground` variants
- Components use shadcn/ui primitives from `src/components/ui/`
- Path alias `@/` maps to `src/`
