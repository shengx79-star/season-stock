import { useState, useEffect, useMemo } from "react";
import { AppNav } from "@/components/AppNav";
import { usePositionSnapshots, type PositionSnapshot } from "@/hooks/usePositionSnapshots";
import { fetchKlineData } from "@/lib/alltickService";
import { seasonEmojis } from "@/lib/stockData";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { Candle } from "@/lib/stockClassifier";

// ─── types ────────────────────────────────────────────────

type OutcomeStatus = "correct" | "wrong" | "neutral" | "pending";

interface SnapshotOutcome {
  snapshot: PositionSnapshot;
  priceChangePct: number | null;   // % change from snapshot price to 5 days later
  stopHit: boolean | null;
  status: OutcomeStatus;           // overall correctness
}

interface ParamSuggestion {
  title: string;
  detail: string;
  sampleCount: number;
  accuracyPct: number;
}

// ─── helpers ──────────────────────────────────────────────

const actionLabels: Record<string, string> = {
  force_exit: "强制退出", reduce: "减仓", exit_autumn: "秋季退出",
  take_profit: "止盈", enter: "建仓", add: "加仓", hold: "持有",
};

const actionColors: Record<string, string> = {
  force_exit: "bg-destructive text-destructive-foreground",
  reduce: "bg-[hsl(var(--autumn))] text-white",
  exit_autumn: "bg-[hsl(var(--autumn))] text-white",
  take_profit: "bg-[hsl(var(--summer))] text-white",
  enter: "bg-[hsl(var(--spring))] text-white",
  add: "bg-primary text-primary-foreground",
  hold: "bg-secondary text-secondary-foreground",
};

// EVAL_DAYS is now a runtime state — see useState in Review component

/** Find the index of the first kline on or after a given date string */
function findDateIndex(klines: Candle[], date: string): number {
  // klines are ascending by date
  return klines.findIndex(k => k.date >= date);
}

function computeOutcome(snap: PositionSnapshot, klines: Candle[], evalDays: number): SnapshotOutcome {
  const base: SnapshotOutcome = {
    snapshot: snap,
    priceChangePct: null,
    stopHit: null,
    status: "pending",
  };

  const idx = findDateIndex(klines, snap.snapshotDate);
  if (idx < 0 || idx + evalDays >= klines.length) return base; // not enough future data

  const entryPrice = snap.currentPrice;
  const futureClose = klines[idx + evalDays].close;
  const priceChangePct = entryPrice > 0 ? (futureClose - entryPrice) / entryPrice * 100 : null;

  // Stop hit: did any bar in the window breach the stop level?
  const stopPct = snap.hardStopPct ?? snap.trailingStopPct ?? null;
  const stopHit = stopPct != null
    ? klines.slice(idx, idx + evalDays).some(k => k.low < entryPrice * (1 - stopPct / 100))
    : false;

  const isEnter = snap.action === "enter" || snap.action === "add";
  const isExit  = snap.action === "reduce" || snap.action === "exit_autumn"
                  || snap.action === "take_profit" || snap.action === "force_exit";

  let status: OutcomeStatus = "neutral";
  if (priceChangePct !== null) {
    if (isEnter)  status = (!stopHit && priceChangePct > 0) ? "correct" : "wrong";
    else if (isExit) status = priceChangePct < 0 ? "correct" : "wrong";
  }

  return { snapshot: snap, priceChangePct, stopHit, status };
}

function generateSuggestions(outcomes: SnapshotOutcome[], evalDays: number): ParamSuggestion[] {
  const evaluated = outcomes.filter(o => o.status !== "pending" && o.status !== "neutral");
  const suggestions: ParamSuggestion[] = [];

  const byStageAction = (stage: string, actions: string[]) =>
    evaluated.filter(o => o.snapshot.stage === stage && actions.includes(o.snapshot.action));

  // Spring enter/add
  const springEnter = byStageAction("spring", ["enter", "add"]);
  if (springEnter.length >= 3) {
    const correct = springEnter.filter(o => o.status === "correct").length;
    const pct = correct / springEnter.length * 100;
    if (pct > 70) {
      suggestions.push({
        title: "春季系数偏保守",
        detail: `春季建仓/加仓 ${evalDays}日准确率 ${pct.toFixed(0)}%（高于基准），当前系数 0.45，可尝试上调至 0.50–0.55`,
        sampleCount: springEnter.length,
        accuracyPct: pct,
      });
    } else if (pct < 45) {
      suggestions.push({
        title: "春季信号误报偏多",
        detail: `春季建仓/加仓 ${evalDays}日准确率仅 ${pct.toFixed(0)}%，考虑提高置信度阈值（0.65→0.75）或减小春季系数（0.45→0.35）`,
        sampleCount: springEnter.length,
        accuracyPct: pct,
      });
    }
  }

  // Winter enter
  const winterEnter = byStageAction("winter", ["enter", "add"]);
  if (winterEnter.length >= 3) {
    const correct = winterEnter.filter(o => o.status === "correct").length;
    const pct = correct / winterEnter.length * 100;
    if (pct < 40) {
      suggestions.push({
        title: "冬季入场成功率偏低",
        detail: `冬季建仓 ${evalDays}日准确率 ${pct.toFixed(0)}%，建议提高冬季入场的置信度阈值（0.60→0.70）`,
        sampleCount: winterEnter.length,
        accuracyPct: pct,
      });
    }
  }

  // Autumn false signals (exit followed by price rise)
  const autumnExit = byStageAction("autumn", ["exit_autumn", "reduce"]);
  if (autumnExit.length >= 3) {
    const falseSig = autumnExit.filter(o => o.status === "wrong").length;
    const falsePct = falseSig / autumnExit.length * 100;
    if (falsePct > 50) {
      suggestions.push({
        title: "秋季退出信号误判偏多",
        detail: `${falsePct.toFixed(0)}% 的秋季退出建议在 ${evalDays} 日内股价反而上涨，秋季判定可能过于敏感`,
        sampleCount: autumnExit.length,
        accuracyPct: 100 - falsePct,
      });
    }
  }

  // Summer holds/adds
  const summerBuy = byStageAction("summer", ["add", "hold"]);
  if (summerBuy.length >= 3) {
    const correct = summerBuy.filter(o => o.status === "correct").length;
    const pct = correct / summerBuy.length * 100;
    if (pct > 75) {
      suggestions.push({
        title: "夏季系数可适当上调",
        detail: `夏季持仓/加仓准确率 ${pct.toFixed(0)}%，当前系数 0.75，可尝试上调至 0.80`,
        sampleCount: summerBuy.length,
        accuracyPct: pct,
      });
    }
  }

  return suggestions;
}

// ─── Review page ──────────────────────────────────────────

const Review = () => {
  const { getSnapshots } = usePositionSnapshots();
  const [snapshots, setSnapshots] = useState<PositionSnapshot[]>([]);
  const [klineMap, setKlineMap] = useState<Map<string, Candle[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [evalDays, setEvalDays] = useState<1 | 3 | 5>(1);

  // Load snapshots
  useEffect(() => {
    setLoading(true);
    getSnapshots(30).then(data => {
      setSnapshots(data);
      setLoading(false);
      if (data.length > 0 && !selectedDate) {
        const dates = [...new Set(data.map(s => s.snapshotDate))].sort().reverse();
        setSelectedDate(dates[0]);
      }
    });
  }, [getSnapshots]); // re-run when user changes

  // Fetch klines for all unique symbols
  useEffect(() => {
    if (snapshots.length === 0) return;
    const symbols = [...new Set(snapshots.map(s => s.symbol))];
    fetchKlineData(symbols).then(result => {
      const map = new Map<string, Candle[]>();
      for (const [sym, data] of result.entries()) {
        map.set(sym, data.dailyBars);
      }
      setKlineMap(map);
    });
  }, [snapshots.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute outcomes for all snapshots
  const outcomes = useMemo<SnapshotOutcome[]>(() => {
    return snapshots.map(snap => {
      const klines = klineMap.get(snap.symbol) || [];
      return computeOutcome(snap, klines, evalDays);
    });
  }, [snapshots, klineMap, evalDays]);

  // Group by date
  const dateGroups = useMemo(() => {
    const map = new Map<string, SnapshotOutcome[]>();
    for (const o of outcomes) {
      const d = o.snapshot.snapshotDate;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(o);
    }
    // Sort dates descending
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [outcomes]);

  // Overall accuracy across all evaluated snapshots
  const overallAccuracy = useMemo(() => {
    const evaluated = outcomes.filter(o => o.status === "correct" || o.status === "wrong");
    if (evaluated.length === 0) return null;
    const correct = evaluated.filter(o => o.status === "correct").length;
    return { pct: correct / evaluated.length * 100, total: evaluated.length };
  }, [outcomes]);

  // Parameter suggestions
  const suggestions = useMemo(() => generateSuggestions(outcomes, evalDays), [outcomes, evalDays]);

  // 按季节胜率统计
  const seasonStats = useMemo(() => {
    const stages = ["spring", "summer", "autumn", "winter"] as const;
    return stages.map(stage => {
      const group = outcomes.filter(o =>
        o.snapshot.stage === stage &&
        (o.status === "correct" || o.status === "wrong")
      );
      const correct = group.filter(o => o.status === "correct").length;
      return {
        stage,
        total: group.length,
        correct,
        pct: group.length > 0 ? correct / group.length * 100 : null,
        avgReturn: group.length > 0
          ? group.reduce((s, o) => s + (o.priceChangePct ?? 0), 0) / group.length
          : null,
      };
    }).filter(s => s.total > 0);
  }, [outcomes]);

  // 按置信度档胜率统计
  const confStats = useMemo(() => {
    const bands = [
      { label: "<50%", min: 0,    max: 0.5  },
      { label: "50–70%", min: 0.5,  max: 0.7  },
      { label: "70–85%", min: 0.7,  max: 0.85 },
      { label: ">85%",  min: 0.85, max: 1.01 },
    ];
    return bands.map(b => {
      const group = outcomes.filter(o =>
        o.snapshot.confidence >= b.min && o.snapshot.confidence < b.max &&
        (o.status === "correct" || o.status === "wrong")
      );
      const correct = group.filter(o => o.status === "correct").length;
      return {
        label: b.label,
        total: group.length,
        correct,
        pct: group.length > 0 ? correct / group.length * 100 : null,
        avgReturn: group.length > 0
          ? group.reduce((s, o) => s + (o.priceChangePct ?? 0), 0) / group.length
          : null,
      };
    }).filter(s => s.total > 0);
  }, [outcomes]);

  // Selected date outcomes
  const selectedOutcomes = useMemo(() => {
    if (!selectedDate) return [];
    return outcomes.filter(o => o.snapshot.snapshotDate === selectedDate);
  }, [outcomes, selectedDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-3 md:px-6 py-2 md:py-3 shrink-0">
        <div className="flex items-center gap-2 md:gap-6">
          <span className="text-lg md:text-2xl font-bold tracking-tight shrink-0">
            <span className="text-[hsl(var(--spring))]">股</span>
            <span className="text-destructive">票</span>
            <span className="text-[hsl(var(--autumn))]">四</span>
            <span className="text-primary">季</span>
          </span>
          <AppNav />
        </div>
        {/* Second row: eval period + accuracy */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">周期</span>
            {([1, 3, 5] as const).map(d => (
              <button
                key={d}
                onClick={() => setEvalDays(d)}
                className={`px-2 py-0.5 rounded transition-colors ${evalDays === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}日
              </button>
            ))}
          </div>
          {overallAccuracy && (
            <span className="text-muted-foreground">
              准确率{" "}
              <span className={`font-bold ${overallAccuracy.pct >= 60 ? "text-green-500" : overallAccuracy.pct >= 45 ? "text-[hsl(var(--autumn))]" : "text-red-500"}`}>
                {overallAccuracy.pct.toFixed(0)}%
              </span>
              <span className="ml-0.5">({overallAccuracy.total})</span>
            </span>
          )}
          {suggestions.length > 0 && (
            <button
              onClick={() => setShowSuggestions(!showSuggestions)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 font-medium hover:bg-amber-500/20"
            >
              <AlertTriangle className="w-3 h-3" />
              建议{suggestions.length}条
            </button>
          )}
        </div>
      </header>

      {/* Parameter suggestions panel */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="border-b border-border bg-amber-500/5 px-4 md:px-6 py-3">
          <div className="max-w-4xl space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs md:text-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-amber-700">{s.title}</span>
                  <span className="text-muted-foreground ml-1 md:ml-2">{s.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm flex-col gap-2">
          <p>暂无复盘数据</p>
          <p className="text-xs">打开仓位管理页面后会自动记录今日快照</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: date list — horizontal scroll on mobile, vertical sidebar on desktop */}
          <div className="md:w-44 shrink-0 border-b md:border-b-0 md:border-r border-border overflow-x-auto md:overflow-y-auto flex md:flex-col">
            {dateGroups.map(([date, items]) => {
              const evaluated = items.filter(o => o.status === "correct" || o.status === "wrong");
              const correct = evaluated.filter(o => o.status === "correct").length;
              const pct = evaluated.length > 0 ? correct / evaluated.length * 100 : null;
              const isToday = date === new Date().toISOString().slice(0, 10);
              const isPending = evaluated.length === 0;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`shrink-0 px-3 py-2 md:py-3 text-left border-r md:border-r-0 md:border-b border-border transition-colors whitespace-nowrap ${
                    selectedDate === date ? "bg-primary/5 md:border-l-2 md:border-l-primary border-b-2 md:border-b-0 border-b-primary" : "hover:bg-secondary/50"
                  }`}
                >
                  <div className="text-xs font-medium text-foreground">
                    {date.slice(5)} {isToday && <span className="text-[10px] text-muted-foreground">(今)</span>}
                  </div>
                  <div className="text-[10px] mt-0.5">
                    {isPending ? (
                      <span className="text-muted-foreground/60">待验</span>
                    ) : (
                      <span className={pct! >= 60 ? "text-green-500" : pct! >= 45 ? "text-[hsl(var(--autumn))]" : "text-red-500"}>
                        {pct!.toFixed(0)}%·{items.length}只
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: detail for selected date */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {/* Deep stats — always visible when there's evaluated data */}
            {(seasonStats.length > 0 || confStats.length > 0) && (
              <div className="max-w-3xl mb-6 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">深度统计</h3>

                {/* Season win rate bars */}
                {seasonStats.length > 0 && (
                  <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-2">
                    <div className="mb-3">
                      <div className="text-xs font-medium text-muted-foreground">按季节胜率</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">统计各季节下操作「正确」的比例及平均收益，样本越多越可靠</div>
                    </div>
                    {seasonStats.map(s => {
                      const label = s.stage === "spring" ? "春" : s.stage === "summer" ? "夏" : s.stage === "autumn" ? "秋" : "冬";
                      const color = s.stage === "spring" ? "hsl(var(--spring))" : s.stage === "summer" ? "hsl(var(--summer))" : s.stage === "autumn" ? "hsl(var(--autumn))" : "hsl(var(--winter))";
                      return (
                        <div key={s.stage} className="flex items-center gap-2">
                          <span className="w-4 text-xs font-bold" style={{ color }}>{label}</span>
                          <div className="flex-1 relative h-5 bg-secondary rounded overflow-hidden">
                            <div
                              className="h-full rounded transition-all"
                              style={{ width: `${s.pct ?? 0}%`, backgroundColor: color, opacity: 0.7 }}
                            />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-foreground">
                              {s.pct!.toFixed(0)}% 胜率
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground w-16 text-right">
                            {s.total}样本
                            {s.avgReturn !== null && (
                              <span className={s.avgReturn >= 0 ? " text-green-500" : " text-red-500"}>
                                {" "}{s.avgReturn >= 0 ? "+" : ""}{s.avgReturn.toFixed(1)}%
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Confidence band table */}
                {confStats.length > 0 && (
                  <div className="rounded-lg border border-border bg-secondary/20 p-4">
                    <div className="mb-3">
                      <div className="text-xs font-medium text-muted-foreground">置信度分布</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">按分类器置信度区间分组，高置信度时胜率与收益是否更稳定</div>
                    </div>
                    <div className="grid grid-cols-[50px_1fr_48px_36px] md:grid-cols-[60px_1fr_56px_56px] gap-x-1.5 md:gap-x-2 gap-y-1 text-[10px]">
                      <span className="text-muted-foreground">区间</span>
                      <span className="text-muted-foreground">胜率</span>
                      <span className="text-muted-foreground text-right">均收益</span>
                      <span className="text-muted-foreground text-right">样本</span>
                      {confStats.map(c => (
                        <>
                          <span key={c.label + "_l"} className="font-mono text-foreground">{c.label}</span>
                          <div key={c.label + "_b"} className="relative h-4 bg-secondary rounded overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${c.pct ?? 0}%`,
                                background: `hsl(${(c.pct ?? 0) >= 60 ? "var(--spring)" : (c.pct ?? 0) >= 45 ? "var(--autumn)" : "0 70% 50%"})`,
                                opacity: 0.65,
                              }}
                            />
                            <span className="absolute inset-0 flex items-center px-1.5 text-[9px] font-medium text-foreground">
                              {c.pct!.toFixed(0)}%
                            </span>
                          </div>
                          <span key={c.label + "_r"} className={`text-right ${(c.avgReturn ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {c.avgReturn !== null ? `${c.avgReturn >= 0 ? "+" : ""}${c.avgReturn.toFixed(1)}%` : "—"}
                          </span>
                          <span key={c.label + "_n"} className="text-right text-muted-foreground">{c.total}</span>
                        </>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedDate && selectedOutcomes.length > 0 ? (
              <div className="max-w-3xl space-y-4">
                {/* Date header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm md:text-base font-semibold">{selectedDate}</h2>
                  <span className="text-xs text-muted-foreground">{selectedOutcomes.length}只</span>
                  {(() => {
                    const ev = selectedOutcomes.filter(o => o.status === "correct" || o.status === "wrong");
                    if (ev.length === 0) return <span className="text-[10px] text-muted-foreground">待{evalDays}日验证</span>;
                    const c = ev.filter(o => o.status === "correct").length;
                    const p = c / ev.length * 100;
                    return (
                      <span className={`text-sm font-bold ${p >= 60 ? "text-green-500" : p >= 45 ? "text-[hsl(var(--autumn))]" : "text-red-500"}`}>
                        {p.toFixed(0)}%
                      </span>
                    );
                  })()}
                </div>

                {/* Market context */}
                {selectedOutcomes[0] && (
                  <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground flex gap-3">
                    <span>市场制度 <span className="text-foreground font-medium">{selectedOutcomes[0].snapshot.marketRegime}</span></span>
                    <span>热度 <span className="text-foreground font-medium">{Math.round(selectedOutcomes[0].snapshot.marketTemperature)}°</span></span>
                  </div>
                )}

                {/* Table header */}
                <div className="grid grid-cols-[1fr_48px_40px_32px] md:grid-cols-[1fr_80px_72px_72px_56px_56px] gap-1 md:gap-2 text-[10px] text-muted-foreground px-1">
                  <span>股票</span>
                  <span className="text-right hidden md:block">当时价</span>
                  <span className="text-right hidden md:block">置信度</span>
                  <span className="text-right">{evalDays}日%</span>
                  <span className="text-center">止损</span>
                  <span className="text-center">结果</span>
                </div>

                {/* Rows */}
                {selectedOutcomes.map((o) => (
                  <SnapshotRow key={o.snapshot.symbol} outcome={o} evalDays={evalDays} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                选择左侧日期查看详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Analysis generator ───────────────────────────────────

function generateRowAnalysis(outcome: SnapshotOutcome, evalDays: number): string {
  const { snapshot: s, priceChangePct, stopHit, status } = outcome;

  if (status === "pending") return `等待 ${evalDays} 个交易日后的K线数据。`;
  if (status === "neutral") return "持有建议无方向性，不参与胜率统计。";

  const isEnter = s.action === "enter" || s.action === "add";
  const isExit  = s.action === "reduce" || s.action === "exit_autumn"
                  || s.action === "take_profit" || s.action === "force_exit";
  const chg = priceChangePct != null
    ? `${priceChangePct > 0 ? "+" : ""}${priceChangePct.toFixed(1)}%`
    : "";

  const parts: string[] = [];

  if (status === "correct" && isEnter) {
    parts.push(`建仓方向正确，${evalDays}日后上涨 ${chg}`);
    if (stopHit) parts.push("期间曾触及止损位但最终收涨，风控与收益并存");
    if (s.confidence >= 0.85) parts.push("高置信度信号兑现");
    else if (s.confidence < 0.5) parts.push("低置信度信号偶然成功，注意样本偶然性");
    if (s.stage === "winter") parts.push("冬季抄底信号有效");
  } else if (status === "wrong" && isEnter) {
    parts.push(`建仓方向偏差，${evalDays}日后下跌 ${chg}`);
    if (stopHit) parts.push("止损触发，风控生效，损失在可控范围内");
    else parts.push("未触及止损位，浮亏中");
    if (s.stage === "spring") parts.push("春季误判风险本就偏高，属于策略已知弱点");
    if (s.confidence >= 0.7) parts.push("中高置信度仍出错，值得回顾分类指标");
  } else if (status === "correct" && isExit) {
    parts.push(`退出/减仓判断正确，股价随后下跌 ${chg}，规避了损失`);
    if (s.action === "exit_autumn") parts.push("秋季清仓策略执行有效");
    if (s.action === "force_exit") parts.push("强制止损后方向验证正确");
  } else if (status === "wrong" && isExit) {
    parts.push(`退出/减仓过早，股价随后上涨 ${chg}，错过了潜在收益`);
    if (s.action === "exit_autumn") parts.push("秋季判定可能过于敏感，可考虑提高阈值");
    if (s.action === "reduce") parts.push("减仓信号误发，股价仍在上行趋势中");
    if (s.action === "take_profit") parts.push("止盈触发后仍继续上涨，跟踪止盈参数可适当放宽");
  }

  // Add market context note
  if (s.marketTemperature < 25) parts.push("当时市场极度偏冷");
  else if (s.marketTemperature > 75) parts.push("当时市场偏热，追高风险较高");

  return parts.join("；") + "。";
}

// ─── SnapshotRow ──────────────────────────────────────────

function SnapshotRow({ outcome, evalDays }: { outcome: SnapshotOutcome; evalDays: number }) {
  const { snapshot: s, priceChangePct, stopHit, status } = outcome;
  const [expanded, setExpanded] = useState(false);
  const analysis = generateRowAnalysis(outcome, evalDays);

  const statusIcon = status === "correct" ? (
    <TrendingUp className="w-4 h-4 text-green-500" />
  ) : status === "wrong" ? (
    <TrendingDown className="w-4 h-4 text-red-500" />
  ) : status === "neutral" ? (
    <Minus className="w-4 h-4 text-muted-foreground" />
  ) : (
    <span className="text-[10px] text-muted-foreground/60">—</span>
  );

  const rowBg = status === "correct" ? "bg-green-500/5 border-l-2 border-l-green-500"
    : status === "wrong" ? "bg-red-500/5 border-l-2 border-l-red-500"
    : "border-l-2 border-l-transparent";

  return (
    <div className={`rounded-lg border border-border ${rowBg}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full grid grid-cols-[1fr_48px_40px_32px] md:grid-cols-[1fr_80px_72px_72px_56px_56px] gap-1 md:gap-2 items-center px-2 md:px-3 py-2 md:py-2.5 text-left"
      >
        {/* Name + action */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">{s.name}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${actionColors[s.action] || "bg-secondary"}`}>
              {actionLabels[s.action] || s.action}
            </span>
            <span className="text-[11px] text-muted-foreground shrink-0">{seasonEmojis[s.stage as keyof typeof seasonEmojis] || ""}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{s.symbol}</div>
          <div className="text-[10px] text-muted-foreground/70 mt-0.5 italic leading-snug">{analysis}</div>
        </div>
        {/* Current price at snapshot — hidden on mobile */}
        <span className="text-xs text-right hidden md:block">¥{s.currentPrice.toFixed(2)}</span>
        {/* Confidence — hidden on mobile */}
        <span className="text-xs text-right text-muted-foreground hidden md:block">{(s.confidence * 100).toFixed(0)}%</span>
        {/* Price change */}
        <span className={`text-xs text-right font-medium ${
          priceChangePct == null ? "text-muted-foreground/50"
          : priceChangePct > 0 ? "text-green-500" : priceChangePct < 0 ? "text-red-500" : "text-muted-foreground"
        }`}>
          {priceChangePct == null ? "—" : `${priceChangePct > 0 ? "+" : ""}${priceChangePct.toFixed(1)}%`}
        </span>
        {/* Stop hit */}
        <span className={`text-[10px] text-center ${stopHit ? "text-red-500 font-medium" : "text-muted-foreground/50"}`}>
          {stopHit == null ? "—" : stopHit ? "触发" : "安全"}
        </span>
        {/* Result */}
        <span className="flex justify-center">{statusIcon}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-muted-foreground bg-secondary/20">
          <div>季节 <span className="text-foreground font-medium">{s.stage}</span></div>
          <div>季节温度 <span className="text-foreground font-medium">{s.seasonScore.toFixed(0)}</span></div>
          {s.costBasis > 0 && <div>当时盈亏 <span className={`font-medium ${s.pnlPct > 0 ? "text-green-500" : s.pnlPct < 0 ? "text-red-500" : ""}`}>{s.pnlPct > 0 ? "+" : ""}{s.pnlPct.toFixed(1)}%</span></div>}
          <div>持仓市值 <span className="text-foreground font-medium">¥{(s.currentPositionValue / 10000).toFixed(1)}万</span></div>
          {s.hardStopPct != null && <div>硬止损 <span className="text-red-500 font-medium">-{s.hardStopPct.toFixed(1)}%</span></div>}
          {s.trailingStopPct != null && <div>跟踪止盈 <span className="text-[hsl(var(--autumn))] font-medium">-{s.trailingStopPct.toFixed(1)}%</span></div>}
          <div>优先级 <span className="text-foreground font-medium">{s.actionPriority}</span></div>
          <div>市场热度 <span className="text-foreground font-medium">{Math.round(s.marketTemperature)}°</span></div>
        </div>
      )}
    </div>
  );
}

export default Review;
