import { describe, it, expect } from "vitest";
import {
  computeATR20,
  computeATREnvFactor,
  computeADV20Value,
  computeMarketContext,
  computePortfolio,
  type PositionInput,
} from "@/lib/positionEngine";
import type { ClassificationResult } from "@/lib/stockClassifier";

// =============================================
// 测试辅助
// =============================================

function makeBar(
  close: number,
  opts: { open?: number; high?: number; low?: number; volume?: number } = {}
) {
  return {
    open: opts.open ?? close,
    high: opts.high ?? close,
    low: opts.low ?? close,
    close,
    volume: opts.volume ?? 1_000_000,
    timestamp: 0,
  };
}

/** 生成 n 条固定波幅的日线 */
function makeBars(n: number, close = 100, tr = 2): ReturnType<typeof makeBar>[] {
  return Array.from({ length: n }, (_, i) => ({
    open: close,
    high: close + tr / 2,
    low: close - tr / 2,
    close,
    volume: 1_000_000,
    timestamp: i,
  }));
}

function makeClassification(
  stage: "winter" | "spring" | "summer" | "autumn",
  confidence: number,
  opts: {
    upTurnCount?: number;
    downTurnCount?: number;
    percentB?: number | null;
    weeklyDailyConflict?: boolean;
  } = {}
): ClassificationResult {
  return {
    stage,
    quantStage: stage,
    finalStage: stage,
    confidence,
    confidenceLevel: confidence >= 0.75 ? "high" : confidence >= 0.55 ? "medium" : "low",
    seasonScore: 50,
    scores: { winter: 0, spring: 0, summer: 0, autumn: 0 },
    scoreBreakdown: {
      trend: { winter: 0, spring: 0, summer: 0, autumn: 0 },
      turn: { winter: 0, spring: 0, summer: 0, autumn: 0 },
      extension: { winter: 0, spring: 0, summer: 0, autumn: 0 },
      weekly: { winter: 0, spring: 0, summer: 0, autumn: 0 },
    },
    turnSignals: {
      ma514Golden: false,
      ma514Dead: false,
      ma520Golden: false,
      ma520Dead: false,
      macdGolden: false,
      macdDead: false,
      priceReclaimMA20: false,
      priceLoseMA20: false,
      rsiLowRecovery: false,
      rsiHighDrop: false,
      kdjRecover: false,
      kdjFall: false,
      upTurnCount: opts.upTurnCount ?? 0,
      downTurnCount: opts.downTurnCount ?? 0,
    },
    flags: {
      bullAlignment: false,
      bearAlignment: false,
      weeklyBullish: stage === "summer",
      weeklyBearish: stage === "winter",
      dailyBullStrong: false,
      dailyBearStrong: false,
      weeklyDailyConflict: opts.weeklyDailyConflict ?? false,
      springEligible: stage === "spring",
      autumnEligible: stage === "autumn",
      lowEvidence: confidence < 0.5,
    },
    notes: [],
    aiCandidates: [],
    needsAI: false,
    indicators: {
      close: 100,
      ma5: null, ma10: null, ma14: null, ma20: null, ma60: null,
      maAlignmentScore: 0,
      rsi14: null, bias20: null, bias60: null,
      dif: null, dea: null, macdHist: null,
      k: null, d: null, j: null,
      bollMid: null, bollUpper: null, bollLower: null,
      percentB: opts.percentB ?? null,
      ma20Slope5: null,
      volumeRatio5: null,
      consecutiveUpDays: 0,
      consecutiveDownDays: 0,
      dayReturnPct: null,
      upperShadowPct: null,
      lowerShadowPct: null,
      amplitudePct: null,
      weekClose: null, weekMA5: null, weekMA10: null,
      weekDif: null, weekDea: null, weekMacdHist: null,
    },
  };
}

function makeInput(
  symbol: string,
  opts: Partial<PositionInput> = {}
): PositionInput {
  return {
    symbol,
    name: symbol,
    currentPrice: 100,
    positionValue: 0,
    costBasis: 0,
    highestCloseSinceEntry: 0,
    atr20: 2,
    quotaValue: 80_000,
    industry: "tech",
    themeCluster: "",
    liquidityLevel: "good",
    ...opts,
  };
}

// =============================================
// computeATR20
// =============================================

describe("computeATR20", () => {
  it("returns 0 when fewer than 21 bars", () => {
    expect(computeATR20(makeBars(20))).toBe(0);
    expect(computeATR20([])).toBe(0);
  });

  it("correctly computes ATR with uniform bars", () => {
    // TR = high-low = 2 for every bar
    const bars = makeBars(25, 100, 2);
    expect(computeATR20(bars)).toBeCloseTo(2, 5);
  });

  it("uses only the last 21 bars (not earlier ones)", () => {
    // First 10 bars have huge TR, last 21 have TR=2
    const early = makeBars(10, 100, 100);
    const recent = makeBars(21, 100, 2);
    const bars = [...early, ...recent];
    expect(computeATR20(bars)).toBeCloseTo(2, 5);
  });
});

// =============================================
// computeATREnvFactor
// =============================================

describe("computeATREnvFactor", () => {
  it("returns 1.0 when fewer than 15 bars", () => {
    expect(computeATREnvFactor(makeBars(14))).toBe(1.0);
    expect(computeATREnvFactor([])).toBe(1.0);
  });

  it("returns 1.0 when recent volatility is same as historical", () => {
    const bars = makeBars(30, 100, 2); // uniform TR throughout
    expect(computeATREnvFactor(bars)).toBe(1.0);
  });

  it("returns 1.0 when recent volatility is lower than historical", () => {
    // Historical bars (first 20) have TR=4, recent 10 have TR=2
    const historical = makeBars(20, 100, 4);
    const recent = makeBars(10, 100, 2);
    const bars = [...historical, ...recent];
    expect(computeATREnvFactor(bars)).toBe(1.0);
  });

  it("returns 0.85 when recent TR is 1.1x–1.3x historical", () => {
    // historical avg TR=2, recent avg TR=2.4 → ratio ≈ 1.2
    const historical = makeBars(20, 100, 2);
    const recent = makeBars(10, 100, 2.4);
    const bars = [...historical, ...recent];
    expect(computeATREnvFactor(bars)).toBe(0.85);
  });

  it("returns 0.65 when recent TR is >1.3x historical", () => {
    // historical avg TR=2, recent avg TR=3 → ratio = 1.5
    const historical = makeBars(20, 100, 2);
    const recent = makeBars(10, 100, 3);
    const bars = [...historical, ...recent];
    expect(computeATREnvFactor(bars)).toBe(0.65);
  });

  it("returns 1.0 when historical avg is zero (no-crash guard)", () => {
    // All bars flat with zero spread — historical bars zeroed
    const flatBar = { open: 100, high: 100, low: 100, close: 100, volume: 0, timestamp: 0 };
    const bars = Array(30).fill(flatBar);
    expect(computeATREnvFactor(bars)).toBe(1.0);
  });
});

// =============================================
// computeADV20Value
// =============================================

describe("computeADV20Value", () => {
  it("returns 0 when fewer than 20 bars", () => {
    expect(computeADV20Value(makeBars(19))).toBe(0);
    expect(computeADV20Value([])).toBe(0);
  });

  it("correctly computes average dollar volume", () => {
    // close=100, volume=1_000_000 → dollar vol = 100M per day
    const bars = makeBars(20, 100);
    expect(computeADV20Value(bars)).toBe(100 * 1_000_000);
  });

  it("uses only the last 20 bars", () => {
    // Early bars have huge volume, last 20 should dominate
    const early = makeBars(10, 100).map(b => ({ ...b, volume: 999_999_999 }));
    const recent = makeBars(20, 50).map(b => ({ ...b, volume: 1_000_000 }));
    const bars = [...early, ...recent];
    expect(computeADV20Value(bars)).toBeCloseTo(50 * 1_000_000, 0);
  });
});

// =============================================
// computeMarketContext
// =============================================

describe("computeMarketContext", () => {
  it("returns mild regime with empty classification map", () => {
    const ctx = computeMarketContext(new Map());
    expect(ctx.regime).toBe("mild");
    expect(ctx.portfolioCap).toBe(0.60);
  });

  it("returns severe_winter when >50% weight is winter", () => {
    const map = new Map([
      ["A", makeClassification("winter", 0.9)],
      ["B", makeClassification("winter", 0.9)],
      ["C", makeClassification("spring", 0.1)],
    ]);
    const ctx = computeMarketContext(map);
    expect(ctx.regime).toBe("severe_winter");
    expect(ctx.portfolioCap).toBe(0.25);
  });

  it("returns healthy_bull when strength>55% and fragility<20%", () => {
    const map = new Map([
      ["A", makeClassification("summer", 0.9)],
      ["B", makeClassification("summer", 0.9)],
      ["C", makeClassification("summer", 0.9)],
    ]);
    const ctx = computeMarketContext(map);
    expect(ctx.regime).toBe("healthy_bull");
    expect(ctx.portfolioCap).toBe(0.85);
  });

  it("computes temperature correctly", () => {
    // 100% winter → temperature = 10
    const map = new Map([["A", makeClassification("winter", 1.0)]]);
    expect(computeMarketContext(map).temperature).toBeCloseTo(10, 5);

    // 100% summer → temperature = 80
    const map2 = new Map([["A", makeClassification("summer", 1.0)]]);
    expect(computeMarketContext(map2).temperature).toBeCloseTo(80, 5);
  });
});

// =============================================
// P1: Spring 先锋仓 / 确认仓
// =============================================

describe("P1: spring pilot vs confirmed entry phase", () => {
  const totalAssets = 1_000_000;
  const clsMap = (phase: "pilot" | "confirmed") => {
    const upTurnCount = phase === "confirmed" ? 2 : 0;
    const confidence  = phase === "confirmed" ? 0.80 : 0.55;
    return new Map([["A", makeClassification("spring", confidence, { upTurnCount })]]);
  };

  it("spring + low confidence → pilot phase → executableTarget is 40% of rawTarget", () => {
    const cls = new Map([["A", makeClassification("spring", 0.55, { upTurnCount: 0 })]]);
    const input = makeInput("A", { quotaValue: 80_000 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    const pos = result.positions[0];

    expect(pos.springEntryPhase).toBe("pilot");
    expect(pos.executableTargetValue).toBeCloseTo(pos.rawTargetValue * 0.4, 1);
  });

  it("spring + high confidence + upTurnCount>=2 → confirmed → full rawTarget", () => {
    const cls = new Map([["A", makeClassification("spring", 0.80, { upTurnCount: 2 })]]);
    const input = makeInput("A", { quotaValue: 80_000 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    const pos = result.positions[0];

    expect(pos.springEntryPhase).toBe("confirmed");
    expect(pos.executableTargetValue).toBeCloseTo(pos.rawTargetValue, 1);
  });

  it("spring + profitable existing position → confirmed regardless of upTurnCount", () => {
    const cls = new Map([["A", makeClassification("spring", 0.70, { upTurnCount: 0 })]]);
    const input = makeInput("A", {
      quotaValue: 80_000,
      positionValue: 10_000,
      costBasis: 90,           // price=100 → pnlPct=+11%
      currentPrice: 100,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    const pos = result.positions[0];

    expect(pos.springEntryPhase).toBe("confirmed");
  });

  it("spring + weekly conflict prevents confirmed even with upTurnCount>=2", () => {
    const cls = new Map([["A", makeClassification("spring", 0.80, {
      upTurnCount: 2,
      weeklyDailyConflict: true,
    })]]);
    const input = makeInput("A", { quotaValue: 80_000 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    const pos = result.positions[0];

    expect(pos.springEntryPhase).toBe("pilot");
  });

  it("non-spring stages have null springEntryPhase", () => {
    for (const stage of ["winter", "summer", "autumn"] as const) {
      const cls = new Map([["A", makeClassification(stage, 0.8)]]);
      const input = makeInput("A");
      const result = computePortfolio(totalAssets, 3, [input], cls);
      expect(result.positions[0].springEntryPhase).toBeNull();
    }
  });

  it("spring pilot positionGap is capped by executableTargetValue, not rawTargetValue", () => {
    const cls = new Map([["A", makeClassification("spring", 0.55, { upTurnCount: 0 })]]);
    const input = makeInput("A", { quotaValue: 80_000, positionValue: 0 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    const pos = result.positions[0];

    // positionGap should equal executableTargetValue (since current=0)
    expect(pos.positionGap).toBeCloseTo(pos.executableTargetValue, 1);
    // and executableTargetValue should be 40% of rawTarget
    expect(pos.executableTargetValue).toBeLessThan(pos.rawTargetValue);
  });
});

// =============================================
// P2: 冬季入场过滤
// =============================================

describe("P2: winter entry filter", () => {
  const totalAssets = 1_000_000;

  it("winter + no signals + confidence<0.60 → hold, not enter", () => {
    const cls = new Map([["A", makeClassification("winter", 0.50, {
      upTurnCount: 0,
      percentB: 50,
    })]]);
    const input = makeInput("A", { positionValue: 0 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("hold");
  });

  it("winter + upTurnCount>=1 → entry allowed", () => {
    const cls = new Map([["A", makeClassification("winter", 0.50, {
      upTurnCount: 1,
      percentB: 50,
    })]]);
    const input = makeInput("A", { positionValue: 0, quotaValue: 80_000 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    // Winter stageCoeff=0.15, so target exists; upTurnCount=1 passes filter
    expect(result.positions[0].action).toBe("enter");
  });

  it("winter + %B<=20 → entry allowed", () => {
    const cls = new Map([["A", makeClassification("winter", 0.50, {
      upTurnCount: 0,
      percentB: 15,
    })]]);
    const input = makeInput("A", { positionValue: 0, quotaValue: 80_000 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("enter");
  });

  it("winter + confidence>=0.60 → entry allowed", () => {
    const cls = new Map([["A", makeClassification("winter", 0.62, {
      upTurnCount: 0,
      percentB: 50,
    })]]);
    const input = makeInput("A", { positionValue: 0, quotaValue: 80_000 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("enter");
  });

  it("winter filter does NOT block existing positions (only new entries)", () => {
    // Has a position, well within target — winter filter shouldn't kick in
    const cls = new Map([["A", makeClassification("winter", 0.50, {
      upTurnCount: 0,
      percentB: 50,
    })]]);
    const input = makeInput("A", {
      positionValue: 8_000,   // already has position
      costBasis: 100,
      currentPrice: 100,
      quotaValue: 80_000,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    // Should hold (already at target), not be blocked by the entry filter
    expect(result.positions[0].action).toBe("hold");
  });
});

// =============================================
// Progressive Exposure: 加仓浮盈授权
// =============================================

describe("progressive exposure: add only when profitable", () => {
  const totalAssets = 1_000_000;

  it("spring + existing position + pnlPct <= 0 → hold (not add)", () => {
    const cls = new Map([["A", makeClassification("spring", 0.80, { upTurnCount: 2 })]]);
    const input = makeInput("A", {
      positionValue: 5_000,
      costBasis: 103,    // price=100 → pnlPct = -2.9%（未触发春季硬止损 -5%）
      currentPrice: 100,
      atr20: 1,          // atrPct=1% → hardStop = max(5%,2%)=5%，-2.9%不触发
      quotaValue: 80_000,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("hold");
    expect(result.positions[0].notes.some(n => n.includes("浮盈授权"))).toBe(true);
  });

  it("spring + existing position + pnlPct > 0 → add", () => {
    const cls = new Map([["A", makeClassification("spring", 0.80, { upTurnCount: 2 })]]);
    const input = makeInput("A", {
      positionValue: 5_000,
      costBasis: 90,    // price=100 → pnlPct = +11%
      currentPrice: 100,
      quotaValue: 80_000,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("add");
  });

  it("summer + existing position + loss → hold", () => {
    const cls = new Map([["A", makeClassification("summer", 0.85)]]);
    const input = makeInput("A", {
      positionValue: 10_000,
      costBasis: 115,
      currentPrice: 100,
      highestCloseSinceEntry: 100,  // no trailing stop breach
      quotaValue: 80_000,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("hold");
  });

  it("pnlPct exactly 0 → hold (boundary: <= 0 condition)", () => {
    const cls = new Map([["A", makeClassification("spring", 0.80, { upTurnCount: 2 })]]);
    const input = makeInput("A", {
      positionValue: 5_000,
      costBasis: 100,   // pnlPct = 0
      currentPrice: 100,
      quotaValue: 80_000,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("hold");
  });
});

// =============================================
// P3: Pending Autumn 提前防守
// =============================================

describe("P3: pending autumn early defense", () => {
  const totalAssets = 1_000_000;

  it("non-autumn + downTurnCount>=2 + position above target → reduce", () => {
    const cls = new Map([["A", makeClassification("summer", 0.80, { downTurnCount: 2 })]]);
    const input = makeInput("A", {
      positionValue: 100_000,  // 大幅超过目标
      costBasis: 100,
      currentPrice: 100,
      highestCloseSinceEntry: 100,
      quotaValue: 80_000,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("reduce");
    expect(result.positions[0].notes.some(n => n.includes("downTurn"))).toBe(true);
  });

  it("non-autumn + downTurnCount=1 + position above target → normal reduce (not early defense)", () => {
    const cls = new Map([["A", makeClassification("summer", 0.80, { downTurnCount: 1 })]]);
    const input = makeInput("A", {
      positionValue: 100_000,
      costBasis: 100,
      currentPrice: 100,
      highestCloseSinceEntry: 100,
      quotaValue: 80_000,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    // Still reduces, but NOT via early-defense path
    expect(result.positions[0].notes.some(n => n.includes("downTurn"))).toBe(false);
  });

  it("non-autumn + downTurnCount>=2 + position within target → no early defense", () => {
    const cls = new Map([["A", makeClassification("summer", 0.85, { downTurnCount: 2 })]]);
    const input = makeInput("A", {
      positionValue: 5_000,   // well below target
      costBasis: 90,
      currentPrice: 100,
      highestCloseSinceEntry: 100,
      quotaValue: 80_000,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    // Should add (profitable summer), not reduce
    expect(result.positions[0].action).not.toBe("reduce");
  });

  it("autumn stage → exit_autumn regardless of downTurnCount", () => {
    const cls = new Map([["A", makeClassification("autumn", 0.80, { downTurnCount: 3 })]]);
    const input = makeInput("A", {
      positionValue: 20_000,
      costBasis: 100,
      currentPrice: 100,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("exit_autumn");
  });
});

// =============================================
// P4: ATR 环境刹车
// =============================================

describe("P4: ATR environment brake on risk budget", () => {
  const totalAssets = 1_000_000;

  it("atrEnvFactor=1.0 baseline risk budget for healthy_bull", () => {
    const cls = new Map([
      ["A", makeClassification("summer", 0.9)],
      ["B", makeClassification("summer", 0.9)],
    ]);
    const input = makeInput("A", { setupScore: 3, atrEnvFactor: 1.0 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    const pos = result.positions[0];
    // healthy_bull: 0.008 × 1.0 × 1.0 × drawdown(1.0) × setup(1.0) × totalAssets
    const expected = totalAssets * 0.008 * 1.0 * 1.0 * 1.0 * 1.0;
    expect(pos.riskBudgetValue).toBeCloseTo(expected, 0);
  });

  it("atrEnvFactor=0.65 reduces risk budget proportionally", () => {
    const cls = new Map([
      ["A", makeClassification("summer", 0.9)],
      ["B", makeClassification("summer", 0.9)],
    ]);
    const input1 = makeInput("A", { setupScore: 3, atrEnvFactor: 1.0 });
    const input2 = makeInput("A", { setupScore: 3, atrEnvFactor: 0.65 });

    const r1 = computePortfolio(totalAssets, 3, [input1], cls);
    const r2 = computePortfolio(totalAssets, 3, [input2], cls);

    expect(r2.positions[0].riskBudgetValue).toBeCloseTo(
      r1.positions[0].riskBudgetValue * 0.65,
      0
    );
  });

  it("atrEnvFactor not provided defaults to 1.0", () => {
    const cls = new Map([["A", makeClassification("summer", 0.9)], ["B", makeClassification("summer", 0.9)]]);
    const inputWithout = makeInput("A", { setupScore: 3 });  // no atrEnvFactor
    const inputWith1   = makeInput("A", { setupScore: 3, atrEnvFactor: 1.0 });

    const r1 = computePortfolio(totalAssets, 3, [inputWithout], cls);
    const r2 = computePortfolio(totalAssets, 3, [inputWith1], cls);

    expect(r1.positions[0].riskBudgetValue).toBeCloseTo(r2.positions[0].riskBudgetValue, 0);
  });
});

// =============================================
// P5: 流动性上限 (ADV20)
// =============================================

describe("P5: liquidity cap from ADV20", () => {
  const totalAssets = 1_000_000;
  const cls = new Map([
    ["A", makeClassification("summer", 0.9)],
    ["B", makeClassification("summer", 0.9)],
  ]);

  it("good liquidity: ADV20=1M → cap=2% = 20,000", () => {
    const input = makeInput("A", {
      quotaValue: 80_000,
      adv20Value: 1_000_000,
      liquidityLevel: "good",
      setupScore: 3,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].liquidityCappedValue).toBeCloseTo(20_000, 0);
  });

  it("fair liquidity: ADV20=1M → cap=1% = 10,000", () => {
    const input = makeInput("A", {
      quotaValue: 80_000,
      adv20Value: 1_000_000,
      liquidityLevel: "fair",
      setupScore: 3,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].liquidityCappedValue).toBeCloseTo(10_000, 0);
  });

  it("none liquidity: liquidityCappedValue = 0 (no buying)", () => {
    const input = makeInput("A", {
      quotaValue: 80_000,
      adv20Value: 1_000_000,
      liquidityLevel: "none",
      setupScore: 3,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].liquidityCappedValue).toBe(0);
    expect(result.positions[0].allowedEntryValue).toBe(0);
  });

  it("no ADV20 data → liquidityCappedValue=0 in output and no cap applied", () => {
    const input = makeInput("A", {
      quotaValue: 80_000,
      setupScore: 3,
      // adv20Value not provided
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    // Output shows 0 (we store 0 for Infinity)
    expect(result.positions[0].liquidityCappedValue).toBe(0);
    // allowedEntryValue should NOT be limited by liquidity (uses Infinity internally)
    expect(result.positions[0].allowedEntryValue).toBeGreaterThan(0);
  });

  it("allowedEntryValue = min(positionGap, riskCapped, liquidityCapped)", () => {
    // Make liquidityCapped the binding constraint
    const input = makeInput("A", {
      quotaValue: 80_000,
      adv20Value: 100_000, // small market → liquidityCap = 100000 × 2% = 2,000
      liquidityLevel: "good",
      atrEnvFactor: 1.0,
      setupScore: 5,        // max setup to ensure riskCapped is large
      currentPrice: 100,
      atr20: 0.5,           // tiny ATR → riskCapped will be large
      positionValue: 0,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    const pos = result.positions[0];

    // liquidityCap = 2,000 should be the binding constraint
    expect(pos.allowedEntryValue).toBeCloseTo(2_000, 0);
    expect(pos.allowedEntryValue).toBeLessThanOrEqual(pos.positionGap);
    expect(pos.allowedEntryValue).toBeLessThanOrEqual(pos.riskCappedValue);
  });
});

// =============================================
// 组合回撤刹车 (Equity Peak)
// =============================================

describe("portfolio drawdown brake via equityPeak", () => {
  const totalAssets = 1_000_000;
  const cls = new Map([
    ["A", makeClassification("summer", 0.9)],
    ["B", makeClassification("summer", 0.9)],
  ]);
  const input = makeInput("A", { setupScore: 3, atrEnvFactor: 1.0 });

  it("no equityPeak → drawdownFactor=1.0 (no brake)", () => {
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].drawdownFactor).toBe(1.0);
  });

  it("equityPeak = totalAssets → drawdownFactor=1.0", () => {
    const result = computePortfolio(totalAssets, 3, [input], cls, totalAssets);
    expect(result.positions[0].drawdownFactor).toBe(1.0);
  });

  it("5% drawdown → drawdownFactor=0.75", () => {
    const peak = totalAssets / (1 - 0.05); // currentEquity is 5% below peak
    const result = computePortfolio(totalAssets, 3, [input], cls, peak);
    expect(result.positions[0].drawdownFactor).toBe(0.75);
  });

  it("8% drawdown → drawdownFactor=0.50", () => {
    const peak = totalAssets / (1 - 0.08);
    const result = computePortfolio(totalAssets, 3, [input], cls, peak);
    expect(result.positions[0].drawdownFactor).toBe(0.5);
  });

  it("12% drawdown → drawdownFactor=0.25", () => {
    const peak = totalAssets / (1 - 0.12);
    const result = computePortfolio(totalAssets, 3, [input], cls, peak);
    expect(result.positions[0].drawdownFactor).toBe(0.25);
  });

  it("equityPeak < totalAssets → treated as no drawdown (drawdownFactor=1.0)", () => {
    // If somehow equityPeak is below current equity, there's no drawdown
    const result = computePortfolio(totalAssets, 3, [input], cls, totalAssets * 0.9);
    expect(result.positions[0].drawdownFactor).toBe(1.0);
  });

  it("drawdown reduces riskBudgetValue proportionally", () => {
    const r_no_dd = computePortfolio(totalAssets, 3, [input], cls);
    const r_8pct  = computePortfolio(totalAssets, 3, [input], cls, totalAssets / (1 - 0.08));

    expect(r_8pct.positions[0].riskBudgetValue).toBeCloseTo(
      r_no_dd.positions[0].riskBudgetValue * 0.5,
      0
    );
  });
});

// =============================================
// P0: baseRiskPct / regimeFactor 数值
// =============================================

describe("P0: risk budget values match v3.1 spec", () => {
  it("healthy_bull: baseRiskPct=0.008, regimeFactor=1.0", () => {
    // All summer → healthy_bull
    const cls = new Map([
      ["A", makeClassification("summer", 0.9)],
      ["B", makeClassification("summer", 0.9)],
    ]);
    const totalAssets = 1_000_000;
    const input = makeInput("A", { setupScore: 3, atrEnvFactor: 1.0 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    // expected = 1M × 0.008 × 1.0 × 1.0(atenv) × 1.0(drawdown) × 1.0(setup)
    expect(result.positions[0].riskBudgetValue).toBeCloseTo(8_000, 0);
  });

  it("setupScore=1 → riskBudgetValue=0 (position blocked)", () => {
    const cls = new Map([["A", makeClassification("summer", 0.9)], ["B", makeClassification("summer", 0.9)]]);
    const input = makeInput("A", { setupScore: 1, atrEnvFactor: 1.0 });
    const result = computePortfolio(1_000_000, 3, [input], cls);
    expect(result.positions[0].riskBudgetValue).toBe(0);
    expect(result.positions[0].riskCappedValue).toBe(0);
  });

  it("setupScore=2 → setupFactor=0.7", () => {
    const cls = new Map([["A", makeClassification("summer", 0.9)], ["B", makeClassification("summer", 0.9)]]);
    const totalAssets = 1_000_000;
    const s3 = makeInput("A", { setupScore: 3, atrEnvFactor: 1.0 });
    const s2 = makeInput("A", { setupScore: 2, atrEnvFactor: 1.0 });
    const r3 = computePortfolio(totalAssets, 3, [s3], cls);
    const r2 = computePortfolio(totalAssets, 3, [s2], cls);
    expect(r2.positions[0].riskBudgetValue).toBeCloseTo(r3.positions[0].riskBudgetValue * 0.7, 0);
  });

  it("setupScore=4 → setupFactor=1.15", () => {
    const cls = new Map([["A", makeClassification("summer", 0.9)], ["B", makeClassification("summer", 0.9)]]);
    const totalAssets = 1_000_000;
    const s3 = makeInput("A", { setupScore: 3, atrEnvFactor: 1.0 });
    const s4 = makeInput("A", { setupScore: 4, atrEnvFactor: 1.0 });
    const r3 = computePortfolio(totalAssets, 3, [s3], cls);
    const r4 = computePortfolio(totalAssets, 3, [s4], cls);
    expect(r4.positions[0].riskBudgetValue).toBeCloseTo(r3.positions[0].riskBudgetValue * 1.15, 0);
  });
});

// =============================================
// 风险止损逻辑 (force_exit / take_profit)
// =============================================

describe("risk stop-loss and trailing stop", () => {
  const totalAssets = 1_000_000;

  it("winter: hard stop triggered at -8% loss (ATR-based)", () => {
    const cls = new Map([["A", makeClassification("winter", 0.60, { upTurnCount: 1 })]]);
    const input = makeInput("A", {
      positionValue: 10_000,
      costBasis: 100,
      currentPrice: 91.5, // -8.5% loss
      atr20: 1,           // atrPct=1% → hardStop = max(8%, 2.5%)=8%
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("force_exit");
  });

  it("spring: hard stop triggered at -5% loss", () => {
    const cls = new Map([["A", makeClassification("spring", 0.80, { upTurnCount: 2 })]]);
    const input = makeInput("A", {
      positionValue: 10_000,
      costBasis: 100,
      currentPrice: 94,  // -6%
      atr20: 1,          // atrPct=1% → hardStop=max(5%, 2%)=5%
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("force_exit");
  });

  it("summer: take_profit when price drops from highest close by trailing stop", () => {
    const cls = new Map([["A", makeClassification("summer", 0.85)]]);
    const input = makeInput("A", {
      positionValue: 10_000,
      costBasis: 80,
      currentPrice: 90,
      highestCloseSinceEntry: 100, // 10% drawdown from peak; default trailingStop=8%
      atr20: 1,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("take_profit");
  });

  it("autumn with position → exit_autumn", () => {
    const cls = new Map([["A", makeClassification("autumn", 0.70)]]);
    const input = makeInput("A", {
      positionValue: 20_000,
      costBasis: 100,
      currentPrice: 100,
    });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("exit_autumn");
  });

  it("autumn without position → hold", () => {
    const cls = new Map([["A", makeClassification("autumn", 0.70)]]);
    const input = makeInput("A", { positionValue: 0 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].action).toBe("hold");
  });
});

// =============================================
// Portfolio-level scaling
// =============================================

describe("portfolio-level scaling", () => {
  const totalAssets = 1_000_000;

  it("positions scale down when total target exceeds portfolio cap", () => {
    // Create many summer stocks that would exceed portfolioCap
    const cls = new Map(
      Array.from({ length: 10 }, (_, i) => [
        `S${i}`,
        makeClassification("summer", 0.9),
      ])
    );
    const inputs = Array.from({ length: 10 }, (_, i) =>
      makeInput(`S${i}`, { quotaValue: 150_000 }) // 10 × 150k = 1.5M > 85% cap
    );
    const result = computePortfolio(totalAssets, 3, inputs, cls);
    const totalTarget = result.positions.reduce((s, p) => s + p.finalTargetValue, 0);
    expect(totalTarget).toBeLessThanOrEqual(totalAssets * 0.85 + 1); // within cap
  });

  it("executableTargetValue is scaled along with finalTargetValue for spring pilot", () => {
    // Two spring stocks (pilot) that together exceed cap
    const cls = new Map([
      ["A", makeClassification("spring", 0.55)],
      ["B", makeClassification("spring", 0.55)],
    ]);
    const inputs = [
      makeInput("A", { quotaValue: 500_000 }),
      makeInput("B", { quotaValue: 500_000 }),
    ];
    const result = computePortfolio(totalAssets, 3, inputs, cls);

    for (const pos of result.positions) {
      // positionGap should equal executableTargetValue (positions are empty)
      expect(pos.positionGap).toBeCloseTo(pos.executableTargetValue, 1);
      // executableTargetValue must be ≤ finalTargetValue
      expect(pos.executableTargetValue).toBeLessThanOrEqual(pos.finalTargetValue + 1);
    }
  });
});

// =============================================
// Edge cases
// =============================================

describe("edge cases", () => {
  const totalAssets = 1_000_000;

  it("empty inputs → empty positions", () => {
    const result = computePortfolio(totalAssets, 3, [], new Map());
    expect(result.positions).toHaveLength(0);
    expect(result.totalPositionValue).toBe(0);
    expect(result.cashRemaining).toBe(totalAssets);
  });

  it("stock not in classifications → unknown stage, action=hold", () => {
    const cls = new Map<string, ClassificationResult>();
    const input = makeInput("MISSING", { positionValue: 0 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].stage).toBe("unknown");
    expect(result.positions[0].action).toBe("hold");
  });

  it("currentPrice=0 → no division by zero crash", () => {
    const cls = new Map([["A", makeClassification("summer", 0.8)]]);
    const input = makeInput("A", { currentPrice: 0, positionValue: 0 });
    expect(() => computePortfolio(totalAssets, 3, [input], cls)).not.toThrow();
  });

  it("atr20=0 → riskCappedValue uses minStopPct floor (no division by zero)", () => {
    const cls = new Map([["A", makeClassification("summer", 0.9)], ["B", makeClassification("summer", 0.9)]]);
    const input = makeInput("A", { atr20: 0, currentPrice: 100, setupScore: 3 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    // With atr20=0, perShareRisk = max(0, 100 × 5%) = 5
    // riskBudgetValue ≈ 8000 → shares = floor(8000/5) = 1600 → riskCapped = 160000
    expect(result.positions[0].riskCappedValue).toBeGreaterThan(0);
  });

  it("results are sorted by actionPriority ascending (force_exit first)", () => {
    const cls = new Map([
      ["STOP", makeClassification("winter", 0.60, { upTurnCount: 1 })],
      ["HOLD", makeClassification("summer", 0.85)],
    ]);
    const inputs = [
      makeInput("HOLD", { positionValue: 5_000, costBasis: 90, currentPrice: 100, quotaValue: 80_000 }),
      makeInput("STOP", { positionValue: 10_000, costBasis: 100, currentPrice: 91, atr20: 1 }),
    ];
    const result = computePortfolio(totalAssets, 3, inputs, cls);
    const priorities = result.positions.map(p => p.actionPriority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it("confidence=0 → setupScore=1 → riskBudgetValue=0 (blocks new position)", () => {
    const cls = new Map([["A", makeClassification("summer", 0.0)]]);
    const input = makeInput("A", { positionValue: 0 });
    const result = computePortfolio(totalAssets, 3, [input], cls);
    expect(result.positions[0].riskBudgetValue).toBe(0);
    expect(result.positions[0].allowedEntryValue).toBe(0);
  });
});
