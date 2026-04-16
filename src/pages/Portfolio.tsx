import { useState, useMemo, useEffect } from "react";
import { useStockPool } from "@/hooks/useStockPool";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useStockClassifications } from "@/hooks/useStockClassification";
import { usePositionSnapshots } from "@/hooks/usePositionSnapshots";
import { useRealtimePrices } from "@/hooks/useRealtimePrices";
import { formatBJTime } from "@/lib/marketHours";
import {
  computePortfolio,
  computeATR20,
  computeATREnvFactor,
  computeADV20Value,
  regimeLabels,
  type PositionInput,
  type StockPositionResult,
  type MarketContext,
  type ActionType,
} from "@/lib/positionEngine";
import { seasonLabels, seasonEmojis, type Season } from "@/lib/stockData";
import { AppNav } from "@/components/AppNav";
import { Settings, TrendingUp, Trash2, Loader2, DollarSign, Briefcase, ChevronLeft, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const actionLabels: Record<ActionType, string> = {
  force_exit: "强制退出", reduce: "减仓", exit_autumn: "秋季退出",
  take_profit: "止盈", enter: "建仓", add: "加仓", hold: "持有",
};

const actionColors: Record<ActionType, string> = {
  force_exit: "bg-destructive text-destructive-foreground",
  reduce: "bg-[hsl(var(--autumn))] text-white",
  exit_autumn: "bg-[hsl(var(--autumn))] text-white",
  take_profit: "bg-[hsl(var(--summer))] text-white",
  enter: "bg-[hsl(var(--spring))] text-white",
  add: "bg-primary text-primary-foreground",
  hold: "bg-secondary text-secondary-foreground",
};

const actionBorderColors: Record<ActionType, string> = {
  force_exit: "border-l-destructive",
  reduce: "border-l-[hsl(var(--autumn))]",
  exit_autumn: "border-l-[hsl(var(--autumn))]",
  take_profit: "border-l-[hsl(var(--summer))]",
  enter: "border-l-[hsl(var(--spring))]",
  add: "border-l-primary",
  hold: "border-l-border",
};

const Portfolio = () => {
  const { stocks: stockPool, togglePortfolio } = useStockPool();
  const { config, positions, loading: portfolioLoading, updateConfig, upsertPosition, removePosition } = usePortfolio();
  const portfolioStocks = useMemo(() => stockPool.filter(s => s.inPortfolio), [stockPool]);
  const { results: allClassifications } = useStockClassifications(stockPool);
  const { results: classifications, dailyBarsMap } = useStockClassifications(portfolioStocks);

  const [showConfig, setShowConfig] = useState(false);
  const [editTotalAssets, setEditTotalAssets] = useState("");
  const [editQuotaPct, setEditQuotaPct] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [editingPosition, setEditingPosition] = useState(false);
  const [posForm, setPosForm] = useState({ positionValue: "", costBasis: "", shares: "", quotaValue: "" });
  const [filterMarket, setFilterMarket] = useState<"all" | "A" | "HK" | "US">("all");
  const [filterSeason, setFilterSeason] = useState<"all" | "spring" | "summer" | "autumn" | "winter">("all");
  const [sortBy, setSortBy] = useState<"default" | "value" | "pnl">("default");
  const [sortDesc, setSortDesc] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "queue">("list");
  const { saveSnapshot } = usePositionSnapshots();

  // 实时行情
  const portfolioSymbols = useMemo(() => portfolioStocks.map(s => s.symbol), [portfolioStocks]);
  const { quotes: liveQuotes, lastUpdated: liveUpdatedAt, isMarketOpen, refresh: refreshLive } = useRealtimePrices(portfolioSymbols);

  const positionInputs: PositionInput[] = useMemo(() => {
    return portfolioStocks.map((stock) => {
      const pos = positions.find((p) => p.symbol === stock.symbol);
      const dailyBars = dailyBarsMap.get(stock.symbol) || [];
      const atr20        = computeATR20(dailyBars);
      const atrEnvFactor = computeATREnvFactor(dailyBars);
      const adv20Value   = computeADV20Value(dailyBars);
      const shares = pos?.shares ?? 0;
      const positionValue = shares * stock.price;
      return {
        symbol: stock.symbol, name: stock.name, currentPrice: stock.price,
        positionValue, costBasis: pos?.costBasis ?? 0,
        highestCloseSinceEntry: pos?.highestCloseSinceEntry ?? 0, atr20,
        quotaValue: pos?.quotaValue ?? null, industry: pos?.industry ?? stock.sector,
        themeCluster: pos?.themeCluster ?? "", liquidityLevel: pos?.liquidityLevel ?? "good",
        atrEnvFactor, adv20Value,
      };
    });
  }, [portfolioStocks, positions, dailyBarsMap]);

  const portfolio = useMemo(() => {
    if (!config || portfolioStocks.length === 0) return null;
    // 市场层用全量股票（allClassifications）保证与 UI 展示一致
    // 个股数据仍用持仓股票（classifications）
    const defaultQuotaValue = config.defaultQuotaPct > 0
      ? config.totalAssets * (config.defaultQuotaPct / 100)
      : 100000; // fallback if not configured
    return computePortfolio(
      config.totalAssets, defaultQuotaValue, positionInputs, classifications,
      undefined,
      allClassifications.size > 0 ? allClassifications : undefined,
    );
  }, [config, positionInputs, classifications, allClassifications, portfolioStocks.length]);

  useEffect(() => {
    if (!selectedSymbol && portfolio?.positions.length) {
      setSelectedSymbol(portfolio.positions[0].symbol);
    }
  }, [portfolio, selectedSymbol]);

  // Auto-init posForm when selected symbol changes
  useEffect(() => {
    if (!selectedSymbol) return;
    const pos = positions.find(p => p.symbol === selectedSymbol);
    setPosForm({
      positionValue: pos?.positionValue?.toString() || "0",
      costBasis: pos?.costBasis?.toString() || "0",
      shares: pos?.shares?.toString() || "0",
      quotaValue: pos?.quotaValue?.toString() || "",
    });
  }, [selectedSymbol, positions]);

  const selectedPos = portfolio?.positions.find((p) => p.symbol === selectedSymbol) ?? null;

  const handleSaveConfig = async () => {
    const ta = parseFloat(editTotalAssets);
    const qp = parseFloat(editQuotaPct);
    if (isNaN(ta) || ta <= 0) { toast.error("请输入有效的总资产"); return; }
    if (isNaN(qp) || qp <= 0 || qp > 100) { toast.error("请输入有效的默认配额比例"); return; }
    await updateConfig(ta, qp);
    setShowConfig(false);
    toast.success("组合配置已更新");
  };

  const handleSavePosition = async (symbol: string) => {
    const pos = positions.find((p) => p.symbol === symbol);
    await upsertPosition({
      symbol, positionValue: parseFloat(posForm.positionValue) || 0,
      costBasis: parseFloat(posForm.costBasis) || 0, shares: parseFloat(posForm.shares) || 0,
      quotaValue: posForm.quotaValue ? parseFloat(posForm.quotaValue) : null,
      highestCloseSinceEntry: pos?.highestCloseSinceEntry ?? 0,
      industry: pos?.industry ?? "", themeCluster: pos?.themeCluster ?? "",
      liquidityLevel: pos?.liquidityLevel ?? "good",
    });
    setEditingPosition(false);
    toast.success("持仓已更新");
  };

  const startEditPosition = (symbol: string) => {
    const pos = positions.find((p) => p.symbol === symbol);
    setPosForm({
      positionValue: pos?.positionValue?.toString() || "0",
      costBasis: pos?.costBasis?.toString() || "0",
      shares: pos?.shares?.toString() || "0",
      quotaValue: pos?.quotaValue?.toString() || "",
    });
    setEditingPosition(true);
  };

  const detectMarket = (symbol: string): "A" | "HK" | "US" => {
    const upper = symbol.toUpperCase();
    if (upper.endsWith(".SH") || upper.endsWith(".SZ") || upper.endsWith(".BJ")) return "A";
    if (upper.endsWith(".HK")) return "HK";
    if (upper.endsWith(".US") || /^[A-Z]+$/.test(upper)) return "US";
    // bare numeric: 6-digit → A股, 5-digit starting with 0 → 港股
    if (/^\d{6}$/.test(symbol)) return "A";
    if (/^0\d{4}$/.test(symbol)) return "HK";
    return "A";
  };

  const filteredPositions = useMemo(() => {
    if (!portfolio) return [];
    const filtered = portfolio.positions.filter((pos) => {
      if (filterMarket !== "all" && detectMarket(pos.symbol) !== filterMarket) return false;
      if (filterSeason !== "all" && pos.stage !== filterSeason) return false;
      return true;
    });
    if (sortBy !== "default") {
      filtered.sort((a, b) => {
        const va = sortBy === "value" ? a.currentPositionValue : a.pnlPct;
        const vb = sortBy === "value" ? b.currentPositionValue : b.pnlPct;
        return sortDesc ? vb - va : va - vb;
      });
    }
    return filtered;
  }, [portfolio, filterMarket, filterSeason, sortBy, sortDesc]);

  // Portfolio summary stats
  const portfolioStats = useMemo(() => {
    if (!portfolio || !config) return null;
    const totalCost = portfolio.positions.reduce((s, p) => {
      if (p.currentPrice <= 0) return s;
      return s + p.costBasis * (p.currentPositionValue / p.currentPrice);
    }, 0);
    const totalPnl = portfolio.totalPositionValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const usedPct = config.totalAssets > 0 ? (portfolio.totalPositionValue / config.totalAssets) * 100 : 0;
    return { totalCost, totalPnl, totalPnlPct, usedPct };
  }, [portfolio, config]);

  // Auto-save daily snapshot when portfolio first loads
  useEffect(() => {
    if (!portfolio) return;
    const today = new Date().toISOString().slice(0, 10);
    saveSnapshot(today, portfolio.positions, portfolio.market);
  }, [portfolio?.positions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (portfolioLoading) {
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
        <div className="flex items-center gap-2 md:gap-6 min-w-0">
          {mobileShowDetail && selectedSymbol ? (
            <button onClick={() => setMobileShowDetail(false)} className="md:hidden p-1 -ml-1 rounded hover:bg-secondary">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : null}
          <span className="text-lg md:text-2xl font-bold tracking-tight shrink-0">
            <span className="text-[hsl(var(--spring))]">股</span>
            <span className="text-destructive">票</span>
            <span className="text-[hsl(var(--autumn))]">四</span>
            <span className="text-primary">季</span>
          </span>
          <AppNav />
          <button
            onClick={() => {
              if (config) { setEditTotalAssets(config.totalAssets.toString()); setEditQuotaPct(config.defaultQuotaPct.toString()); }
              setShowConfig(!showConfig);
            }}
            className="p-1.5 md:p-2 rounded-lg hover:bg-secondary transition-colors ml-auto shrink-0"
          >
            <Settings className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Config panel */}
      {showConfig && config && (
        <div className="border-b border-border px-3 md:px-6 py-3 md:py-4 bg-card">
          <div className="max-w-xl mx-auto">
            <h3 className="font-semibold text-sm mb-3">组合配置</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">总资产</label>
                <input type="number" value={editTotalAssets} onChange={(e) => setEditTotalAssets(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">默认配额 (%)</label>
                <input type="number" value={editQuotaPct} onChange={(e) => setEditQuotaPct(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm" />
              </div>
            </div>
            <button onClick={handleSaveConfig}
              className="mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
              保存
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: stock list */}
        <div className={`md:w-80 shrink-0 md:border-r border-border flex flex-col overflow-hidden ${
          mobileShowDetail ? "hidden md:flex" : "flex-1 md:flex-none"
        }`}>
          {/* Market summary bar */}
          {portfolio && (
            <div className="px-2.5 md:p-3 py-2.5 border-b border-border bg-card">
              <div className="flex items-center justify-between mb-1.5 md:mb-2 flex-wrap gap-1">
                <span className="text-xs font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {regimeLabels[portfolio.market.regime]}
                </span>
                <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                  <span className={`flex items-center gap-1 text-[10px] font-medium ${isMarketOpen ? "text-green-500" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isMarketOpen ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                    {isMarketOpen ? "盘中" : "收盘"}
                  </span>
                  {liveUpdatedAt && (
                    <span className="text-[10px] text-muted-foreground/60">{formatBJTime(liveUpdatedAt)}</span>
                  )}
                  <button onClick={refreshLive} className="p-0.5 hover:text-foreground text-muted-foreground/60 transition-colors" title="刷新">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <span className={`text-xs md:text-sm font-bold flex items-center gap-0.5 ${
                    portfolio.market.temperature > 60 ? "text-[hsl(var(--summer))]"
                    : portfolio.market.temperature > 40 ? "text-[hsl(var(--autumn))]"
                    : portfolio.market.temperature > 20 ? "text-[hsl(var(--spring))]"
                    : "text-primary"
                  }`}>
                    <span className="text-[10px] md:text-xs font-normal text-muted-foreground">热度</span>
                    {Math.round(portfolio.market.temperature)}°
                  </span>
                </div>
              </div>
              <div className="flex gap-1 text-[10px] flex-wrap mb-2">
                <span className="px-1.5 py-0.5 rounded bg-secondary">上限 {Math.round(portfolio.market.portfolioCap * 100)}%</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary">持仓 {formatMoney(portfolio.totalPositionValue)}</span>
                {portfolioStats && portfolioStats.totalCost > 0 && (
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    portfolioStats.totalPnl > 0 ? "bg-green-500/10 text-green-500"
                    : portfolioStats.totalPnl < 0 ? "bg-red-500/10 text-red-500"
                    : "bg-secondary text-muted-foreground"
                  }`}>
                    {portfolioStats.totalPnl > 0 ? "+" : ""}{formatMoney(portfolioStats.totalPnl)}
                    {" "}({portfolioStats.totalPnlPct > 0 ? "+" : ""}{portfolioStats.totalPnlPct.toFixed(1)}%)
                  </span>
                )}
              </div>
              {/* 已用仓位进度条 */}
              {portfolioStats && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                    <span>已用仓位</span>
                    <span>{portfolioStats.usedPct.toFixed(1)}% / {Math.round(portfolio.market.portfolioCap * 100)}%上限</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all ${
                        portfolioStats.usedPct > portfolio.market.portfolioCap * 100 * 0.9
                          ? "bg-[hsl(var(--summer))]"
                          : portfolioStats.usedPct > portfolio.market.portfolioCap * 100 * 0.6
                          ? "bg-[hsl(var(--autumn))]"
                          : "bg-[hsl(var(--spring))]"
                      }`}
                      style={{ width: `${Math.min(portfolioStats.usedPct / (portfolio.market.portfolioCap * 100) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {/* 行业分布 */}
              <IndustryBreakdown positions={portfolio.positions} totalAssets={config?.totalAssets ?? 0} />
            </div>
          )}

          {/* Filter & sort chips */}
          <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1.5 items-center">
            {(["A", "HK", "US"] as const).map((m) => (
              <button key={m} onClick={() => setFilterMarket(filterMarket === m ? "all" : m)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  filterMarket === m ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}>
                {m === "A" ? "A股" : m === "HK" ? "港股" : "美股"}
              </button>
            ))}
            <div className="w-px bg-border self-stretch mx-0.5" />
            {(["spring", "summer", "autumn", "winter"] as const).map((s) => (
              <button key={s} onClick={() => setFilterSeason(filterSeason === s ? "all" : s)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  filterSeason === s
                    ? `bg-[hsl(var(--${s}))] text-white`
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}>
                {seasonEmojis[s]}
              </button>
            ))}
            <div className="w-px bg-border self-stretch mx-0.5" />
            {(["value", "pnl"] as const).map((key) => (
              <button key={key} onClick={() => {
                if (sortBy === key) {
                  if (sortDesc) setSortDesc(false);
                  else { setSortBy("default"); setSortDesc(true); }
                } else { setSortBy(key); setSortDesc(true); }
              }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-0.5 ${
                  sortBy === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}>
                {key === "value" ? "总价" : "盈亏"}
                <span className="text-[9px] opacity-60">{sortBy === key ? (sortDesc ? "↓" : "↑") : "↕"}</span>
              </button>
            ))}
            <div className="w-px bg-border self-stretch mx-0.5" />
            <button
              onClick={() => setViewMode(viewMode === "queue" ? "list" : "queue")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                viewMode === "queue" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              待办
            </button>
          </div>

          {/* Stock list */}
          <div className="flex-1 overflow-y-auto">
            {viewMode === "queue" ? (
              /* ── 待办优先级队列视图 ── */
              (() => {
                const urgent   = filteredPositions.filter(p => p.action === "force_exit" || p.action === "take_profit");
                const exits    = filteredPositions.filter(p => p.action === "exit_autumn" || p.action === "reduce");
                const buys     = filteredPositions.filter(p => p.action === "enter" || p.action === "add");
                const watching = filteredPositions.filter(p => p.action === "hold");

                const groups = [
                  { key: "urgent",   dot: "bg-red-500",    label: "立即执行", items: urgent },
                  { key: "exits",    dot: "bg-orange-400", label: "减仓/退出", items: exits },
                  { key: "buys",     dot: "bg-[hsl(var(--spring))]", label: "建仓/加仓", items: buys },
                  { key: "watching", dot: "bg-muted-foreground",     label: "持有观察", items: watching },
                ].filter(g => g.items.length > 0);

                if (groups.length === 0) {
                  return (
                    <div className="p-6 text-center text-muted-foreground text-xs">当前筛选条件下无待办</div>
                  );
                }

                return groups.map(group => (
                  <div key={group.key}>
                    <div className="px-3 py-1.5 flex items-center gap-2 bg-secondary/40 border-b border-border">
                      <span className={`w-2 h-2 rounded-full ${group.dot}`} />
                      <span className="text-[11px] font-semibold text-muted-foreground">{group.label}</span>
                      <span className="text-[10px] text-muted-foreground/60">{group.items.length}只</span>
                    </div>
                    {group.items.map(pos => (
                      <button
                        key={pos.symbol}
                        onClick={() => { setSelectedSymbol(pos.symbol); setEditingPosition(false); setMobileShowDetail(true); }}
                        className={`w-full px-3 py-2 text-left border-l-3 border-b border-border transition-colors ${
                          selectedSymbol === pos.symbol
                            ? `bg-primary/5 ${actionBorderColors[pos.action]}`
                            : `hover:bg-secondary/50 border-l-transparent`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">{pos.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${actionColors[pos.action]}`}>
                                {actionLabels[pos.action]}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                              <span>{seasonEmojis[pos.stage]} {pos.stage !== "unknown" ? seasonLabels[pos.stage] : ""}</span>
                              {pos.springEntryPhase && (
                                <span>{pos.springEntryPhase === "pilot" ? "先锋" : "确认"}</span>
                              )}
                              {pos.costBasis > 0 && (
                                <span className={`font-medium ${pos.pnlPct > 0 ? "text-green-500" : pos.pnlPct < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                                  {pos.pnlPct > 0 ? "+" : ""}{pos.pnlPct.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            {(pos.action === "enter" || pos.action === "add") && pos.allowedEntryValue > 0 ? (
                              <div className="text-xs font-semibold text-[hsl(var(--spring))]">
                                +{formatMoney(pos.allowedEntryValue)}
                              </div>
                            ) : (pos.action === "reduce" || pos.action === "exit_autumn" || pos.action === "force_exit" || pos.action === "take_profit") && pos.positionGap < 0 ? (
                              <div className="text-xs font-semibold text-[hsl(var(--summer))]">
                                {formatMoney(pos.positionGap)}
                              </div>
                            ) : null}
                            <div className="text-[10px] text-muted-foreground">目标 {formatMoney(pos.finalTargetValue)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ));
              })()
            ) : (
              /* ── 普通列表视图 ── */
              filteredPositions.map((pos) => {
                const livePrice = liveQuotes.get(pos.symbol)?.price ?? pos.currentPrice;
                const stopPct = pos.hardStopPct ?? pos.trailingStopPct ?? null;
                const stopBufferPct = (stopPct != null && pos.costBasis > 0)
                  ? (livePrice - pos.costBasis * (1 - stopPct / 100)) / livePrice * 100
                  : null;
                const nearStop = stopBufferPct != null && stopBufferPct <= 3 && pos.costBasis > 0;
                return (
                <button
                  key={pos.symbol}
                  onClick={() => { setSelectedSymbol(pos.symbol); setEditingPosition(false); setMobileShowDetail(true); }}
                  className={`w-full px-3 py-2.5 text-left border-l-3 border-b border-border transition-colors ${
                    nearStop
                      ? `bg-destructive/5 border-l-destructive`
                      : selectedSymbol === pos.symbol
                        ? `bg-primary/5 ${actionBorderColors[pos.action]}`
                        : `hover:bg-secondary/50 border-l-transparent`
                  }`}
                >
                  {nearStop && (
                    <div className="flex items-center gap-1 text-[10px] font-medium text-destructive mb-1.5 bg-destructive/10 -mx-3 -mt-2.5 px-3 py-1">
                      ⚠️ 距止损仅 {stopBufferPct!.toFixed(1)}%，注意风险
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{pos.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${actionColors[pos.action]}`}>
                          {actionLabels[pos.action]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{pos.symbol}</span>
                        {pos.stage !== "unknown" && (
                          <span className="text-[11px] text-muted-foreground">
                            {seasonEmojis[pos.stage]} {seasonLabels[pos.stage]}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const liveQ = liveQuotes.get(pos.symbol);
                        const livePrice = liveQ?.price ?? pos.currentPrice;
                        const livePnlPct = pos.costBasis > 0 ? (livePrice - pos.costBasis) / pos.costBasis * 100 : pos.pnlPct;
                        const priceChanged = liveQ && Math.abs(livePrice - pos.currentPrice) > 0.001;
                        return (
                          <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                            <span className={`${priceChanged ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                              ¥{livePrice.toFixed(2)}
                              {liveQ && liveQ.changePercent !== 0 && (
                                <span className={`ml-1 ${liveQ.changePercent > 0 ? "text-green-500" : "text-red-500"}`}>
                                  {liveQ.changePercent > 0 ? "+" : ""}{liveQ.changePercent.toFixed(2)}%
                                </span>
                              )}
                            </span>
                            {pos.currentPositionValue > 0 && (
                              <span className="text-muted-foreground">持仓 {formatMoney(pos.currentPositionValue)}</span>
                            )}
                            {pos.costBasis > 0 && (
                              <span className={`font-medium ${livePnlPct > 0 ? "text-green-500" : livePnlPct < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                                {livePnlPct > 0 ? "+" : ""}{livePnlPct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className={`text-xs font-medium ${
                        pos.positionGap > 0 ? "text-[hsl(var(--summer))]"
                        : pos.positionGap < 0 ? "text-[hsl(var(--spring))]"
                        : "text-muted-foreground"
                      }`}>
                        {pos.positionGap > 0 ? "+" : ""}{formatMoney(pos.positionGap)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        目标 {formatMoney(pos.finalTargetValue)}
                      </div>
                      {pos.trendBucketValue > 0 && pos.stage === "summer" && (
                        <div className="text-[10px] text-[hsl(var(--summer))] font-medium mt-0.5">
                          趋势 +{formatMoney(pos.trendBucketValue)}
                        </div>
                      )}
                      {stopBufferPct != null && (
                        <div className={`text-[10px] font-medium mt-0.5 ${
                          stopBufferPct <= 3 ? "text-destructive"
                          : stopBufferPct <= 8 ? "text-[hsl(var(--autumn))]"
                          : "text-muted-foreground/60"
                        }`}>
                          距止损 {stopBufferPct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 迷你仓位进度条：当前持仓 vs 目标 */}
                  {pos.effectiveQuota > 0 && (
                    <div className="mt-1.5 relative h-2">
                      {/* 色带（overflow-hidden 保证圆角） */}
                      <div className="absolute inset-0 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`absolute h-full rounded-full transition-all ${
                            pos.currentPositionValue < pos.finalTargetValue * 0.95
                              ? "bg-[hsl(var(--spring))]"
                              : pos.currentPositionValue > pos.finalTargetValue * 1.05
                              ? "bg-[hsl(var(--summer))]"
                              : "bg-muted-foreground"
                          }`}
                          style={{ width: `${Math.min((pos.currentPositionValue / pos.effectiveQuota) * 100, 100)}%` }}
                        />
                      </div>
                      {/* 目标位标记：小圆点，不被 overflow-hidden 截断 */}
                      {pos.finalTargetValue > 0 && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background shadow-sm z-10"
                          style={{ left: `calc(${Math.min((pos.finalTargetValue / pos.effectiveQuota) * 100, 98)}% - 5px)` }}
                        />
                      )}
                    </div>
                  )}
                </button>
                );
              })
            )}
            {!portfolio || portfolio.positions.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs">
                请在四季分析页面标记股票进入仓位管理
              </div>
            ) : filteredPositions.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs">
                当前筛选条件下无持仓
              </div>
            ) : null}
          </div>
        </div>

        {/* Right: detail panel */}
        <div className={`flex-1 overflow-y-auto ${
          mobileShowDetail ? "flex flex-col" : "hidden md:block"
        }`}>
          {selectedPos ? (
            <DetailPanel
              pos={selectedPos}
              posForm={posForm}
              totalAssets={config?.totalAssets ?? 0}
              defaultQuotaPct={config?.defaultQuotaPct ?? 10}
              market={portfolio?.market ?? null}
              onSave={() => handleSavePosition(selectedPos.symbol)}
              onFormChange={setPosForm}
              onRemoveFromPortfolio={async () => {
                await togglePortfolio(selectedPos.symbol, false);
                removePosition(selectedPos.symbol);
                setSelectedSymbol(null);
                setMobileShowDetail(false);
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              选择左侧股票查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================
// Layer Step Component — reusable for each layer
// =============================================

function LayerStep({
  layerNum,
  title,
  subtitle,
  outputLabel,
  outputValue,
  outputColor,
  children,
  defaultOpen = false,
}: {
  layerNum: string;
  title: string;
  subtitle?: string;
  outputLabel: string;
  outputValue: string;
  outputColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="relative">
      {/* Connector line */}
      <div className="absolute left-3.5 md:left-5 top-8 md:top-10 bottom-0 w-px bg-border" />

      <div className="relative">
        {/* Layer number badge */}
        <div className="flex items-start gap-2 md:gap-3">
          <div className="w-7 h-7 md:w-10 md:h-10 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center shrink-0 z-10 bg-background">
            <span className="text-[10px] md:text-xs font-bold text-primary">{layerNum}</span>
          </div>
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setOpen(!open)}
              className="w-full text-left flex items-center justify-between group gap-1"
            >
              <div className="min-w-0">
                <h3 className="text-xs md:text-sm font-semibold">{title}</h3>
                {subtitle && <p className="text-[10px] md:text-[11px] text-muted-foreground leading-snug">{subtitle}</p>}
              </div>
              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                <div className="text-right">
                  <div className="text-[9px] md:text-[10px] text-muted-foreground">{outputLabel}</div>
                  <div className={`text-xs md:text-sm font-bold ${outputColor || ""}`}>{outputValue}</div>
                </div>
                {open ? <ChevronDown className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4 text-muted-foreground" />}
              </div>
            </button>

            {open && (
              <div className="mt-2 mb-1 rounded-lg bg-secondary/40 border border-border/50 p-2 md:p-3">
                {children}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowItem({ label, value, color, emphasis, hint }: { label: string; value: string; color?: string; emphasis?: boolean; hint?: string }) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className={`text-xs font-medium ${emphasis ? "font-bold" : ""} ${color || ""}`}>{value}</span>
      </div>
      {hint && (
        <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug pl-0.5">{hint}</p>
      )}
    </div>
  );
}

function FormulaBlock({ formula, result }: { formula: string; result: string }) {
  return (
    <div className="rounded bg-background/60 p-2 text-[11px] font-mono mt-1.5">
      <div className="text-muted-foreground break-all">{formula}</div>
      <div className="font-semibold mt-0.5">= {result}</div>
    </div>
  );
}

// =============================================
// Detail Panel — 四层架构可视化
// =============================================

interface DetailPanelProps {
  pos: StockPositionResult;
  posForm: { positionValue: string; costBasis: string; shares: string; quotaValue: string };
  totalAssets: number;
  defaultQuotaPct: number;
  market: MarketContext | null;
  onSave: () => void;
  onFormChange: (form: { positionValue: string; costBasis: string; shares: string; quotaValue: string }) => void;
  onRemoveFromPortfolio: () => void;
}

function DetailPanel({ pos, posForm, totalAssets, defaultQuotaPct, market, onSave, onFormChange, onRemoveFromPortfolio }: DetailPanelProps) {
  const quota = pos.effectiveQuota > 0 ? pos.effectiveQuota : totalAssets;
  const positionPct = quota > 0 ? (pos.currentPositionValue / quota * 100) : 0;
  const targetPct   = quota > 0 ? (pos.finalTargetValue   / quota * 100) : 0;
  const positionTotalPct = totalAssets > 0 ? (pos.currentPositionValue / totalAssets * 100) : 0;
  const targetTotalPct   = totalAssets > 0 ? (pos.finalTargetValue   / totalAssets * 100) : 0;
  const portfolioCap = market?.portfolioCap ?? 0;

  // P0: 风险预算各因子（与 positionEngine.ts 保持同步）
  const baseRiskPctByRegime: Record<string, number> = {
    healthy_bull: 0.008, neutral_bull: 0.006, mild: 0.005,
    overheated: 0.0045, weakening: 0.0035, severe_winter: 0.002,
  };
  const regimeFactorByRegime: Record<string, number> = {
    healthy_bull: 1.0, neutral_bull: 0.9, mild: 0.8,
    overheated: 0.7, weakening: 0.5, severe_winter: 0.3,
  };
  const setupFactorByScore: Record<number, number> = { 0: 0, 1: 0, 2: 0.7, 3: 1.0, 4: 1.15, 5: 1.25 };
  const regime = market?.regime ?? "mild";
  const baseRiskPct = baseRiskPctByRegime[regime] ?? 0.005;
  const regimeFactor = regimeFactorByRegime[regime] ?? 0.8;
  const setupScore = Math.min(5, Math.max(0, Math.round(pos.setupScore)));
  const setupFactor = setupFactorByScore[setupScore] ?? 1.0;

  // P2: 有效配额来源判断（无上限，直接用自定义或默认配额）
  const computedDefaultQuota = totalAssets * defaultQuotaPct / 100;
  const quotaIsDefault = Math.abs(pos.effectiveQuota - computedDefaultQuota) < 1;

  // P3: 是否为减仓/退出场景
  const isExitScenario = pos.action === "reduce" || pos.action === "exit_autumn" || pos.action === "force_exit" || pos.action === "take_profit";

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 md:gap-3 flex-wrap">
            <h2 className="text-lg md:text-xl font-bold">{pos.name}</h2>
            <span className="text-xs md:text-sm text-muted-foreground">{pos.symbol}</span>
            {pos.stage !== "unknown" && (
              <span className="text-xs md:text-sm">{seasonEmojis[pos.stage]} {seasonLabels[pos.stage]}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`px-2 py-0.5 md:px-2.5 md:py-1 rounded text-[11px] md:text-xs font-semibold ${actionColors[pos.action]}`}>
              {actionLabels[pos.action]}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl md:text-2xl font-bold">¥{pos.currentPrice.toFixed(2)}</div>
          {pos.costBasis > 0 && (
            <div className={`text-xs md:text-sm font-medium ${pos.pnlPct > 0 ? "text-[hsl(var(--summer))]" : pos.pnlPct < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {pos.pnlPct > 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Action notes */}
      <div className="rounded-lg bg-secondary/50 p-3 space-y-1">
        {pos.notes.filter(Boolean).map((note, i) => (
          <p key={i} className="text-sm">{note}</p>
        ))}
      </div>

      {/* 风险/收益指示条 */}
      {(pos.hardStopPct != null || pos.trailingStopPct != null) && (
        <RiskReturnBar pos={pos} />
      )}

      {/* 成本价 & 盈亏详情 — 内联编辑 */}
      {(() => {
        const costBasis   = parseFloat(posForm.costBasis) || 0;
        const shares      = parseFloat(posForm.shares) || 0;
        const marketValue = shares * pos.currentPrice;
        const pnlPct      = costBasis > 0 ? (pos.currentPrice - costBasis) / costBasis * 100 : 0;
        const pnlAmount   = shares * (pos.currentPrice - costBasis);
        const isProfit = pnlPct > 0;
        const isLoss   = pnlPct < 0;
        const pnlColor = isProfit ? "text-green-500" : isLoss ? "text-red-500" : "text-muted-foreground";
        const pnlBg    = isProfit ? "bg-green-500/10 border-green-500/20"
                       : isLoss   ? "bg-red-500/10 border-red-500/20"
                       : "bg-secondary border-border";
        const inputCls = "w-full px-2 py-1 rounded border border-input bg-background/80 text-sm font-semibold text-center focus:outline-none focus:ring-1 focus:ring-primary";
        return (
          <div className={`rounded-lg border px-4 py-3 space-y-2 ${pnlBg}`}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xs text-muted-foreground mb-1">成本价</div>
                <input type="number" value={posForm.costBasis}
                  onChange={(e) => onFormChange({ ...posForm, costBasis: e.target.value })}
                  className={inputCls} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">持股数</div>
                <input type="number" value={posForm.shares}
                  onChange={(e) => onFormChange({ ...posForm, shares: e.target.value })}
                  className={inputCls} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">配额</div>
                <input type="number" value={posForm.quotaValue}
                  onChange={(e) => onFormChange({ ...posForm, quotaValue: e.target.value })}
                  placeholder={`默认${Math.round(totalAssets * defaultQuotaPct / 100 / 10000)}万`}
                  className={inputCls + " placeholder:text-muted-foreground/50 placeholder:text-[10px]"} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
              <div>现价 <span className="font-medium text-foreground">¥{pos.currentPrice.toFixed(2)}</span></div>
              <div>市值 <span className="font-medium text-foreground">{formatMoney(marketValue)}</span></div>
              <div className={pnlColor}>
                {costBasis > 0 ? <>{isProfit ? "+" : ""}{pnlPct.toFixed(2)}% ({isProfit ? "+" : ""}{formatMoney(pnlAmount)})</> : "—"}
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button onClick={onSave}
                className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">
                保存
              </button>
            </div>
          </div>
        );
      })()}

      {/* Position bar */}
      <div className="space-y-2">
        <PositionBar label="配额（基准）" value={pos.effectiveQuota} pct={100} color="bg-border" />
        <PositionBar label="当前仓位" value={pos.currentPositionValue} pct={positionPct} color="bg-muted-foreground" />
        <PositionBar label="目标仓位" value={pos.finalTargetValue} pct={targetPct} color="bg-primary" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>差额: <span className={`font-medium ${pos.positionGap > 0 ? "text-[hsl(var(--summer))]" : pos.positionGap < 0 ? "text-[hsl(var(--spring))]" : ""}`}>
            {pos.positionGap > 0 ? "+" : ""}{formatMoney(pos.positionGap)}
          </span></span>
          <span>占配额 {targetPct.toFixed(1)}% · 占总资产 {targetTotalPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* ========== 四层引擎计算流水线 ========== */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <span className="w-1.5 h-4 rounded-full bg-primary inline-block" />
          引擎计算流水线
        </h3>

        <div className="space-y-4 pl-0">
          {/* Layer 1: 市场层 */}
          {market && (
            <LayerStep
              layerNum="L1"
              title="市场层 · Market Context"
              subtitle="今天整个组合最多能有多少仓位？用股票池所有股票的四季分布判断大环境"
              outputLabel="仓位上限"
              outputValue={`${Math.round(portfolioCap * 100)}%`}
              outputColor="text-primary"
            >
              <div className="space-y-0.5">
                <FlowItem label="市场状态" value={regimeLabels[market.regime]}
                  hint={market.regime === "severe_winter" ? "超过50%股票在冬季 → 严冬，大幅限制仓位"
                    : market.regime === "healthy_bull" ? "夏/春占比强且秋季少 → 健康多头，可大胆配置"
                    : market.regime === "overheated" ? "夏/春强但秋季也多 → 过热脆弱，需警惕"
                    : market.regime === "neutral_bull" ? "夏/春中等水平 → 中性偏多，稳健配置"
                    : market.regime === "weakening" ? "冬+秋双高 → 市场转弱，收缩仓位"
                    : "其他情况 → 温和市场，适度参与"} />
                <FlowItem label={`水温 ${Math.round(market.temperature)}°`}
                  value={`冬${(market.winterShare*100).toFixed(0)}% 春${(market.springShare*100).toFixed(0)}% 夏${(market.summerShare*100).toFixed(0)}% 秋${(market.autumnShare*100).toFixed(0)}%`}
                  hint="水温 = 10×冬占比 + 40×春占比 + 80×夏占比 + 60×秋占比" />
                <FlowItem label="多头强度 (strength)" value={market.strength.toFixed(2)}
                  hint="= 0.5×春占比 + 1.0×夏占比，越高市场越强" />
                <FlowItem label="脆弱度 (fragility)" value={market.fragility.toFixed(2)}
                  hint="= 1.0×秋占比，秋季股票越多市场越脆弱" />
                <FlowItem label="避险度 (riskOff)" value={market.riskOff.toFixed(2)}
                  hint="= 1.0×冬占比，冬季股票过半将判定严冬" />
                <div className="border-t border-border/50 mt-1.5 pt-1.5">
                  <FlowItem label="输出 → 组合仓位上限" value={`${Math.round(portfolioCap * 100)}%`} emphasis color="text-primary"
                    hint={`所有股票目标仓位之和不能超过总资产的${Math.round(portfolioCap * 100)}%，超出部分按比例缩放`} />
                </div>
              </div>
            </LayerStep>
          )}

          {/* Layer 2: 个股目标仓位 */}
          <LayerStep
            layerNum="L2"
            title="个股层 · Target Position"
            subtitle="这只股票理论上该配多少钱？"
            outputLabel="原始目标"
            outputValue={formatMoney(pos.rawTargetValue)}
            defaultOpen
          >
            <div className="space-y-0.5">
              <FlowItem label="有效配额" value={formatMoney(pos.effectiveQuota)}
                hint={quotaIsDefault
                  ? "未配置自定义 quota，使用默认配额 ¥10万"
                  : `自定义 quota = ${formatMoney(pos.effectiveQuota)}，在编辑持仓中设置`} />
              <FlowItem label={`季节系数 (${pos.stage})`} value={`×${pos.stageCoeff}`}
                hint={pos.stage === "winter" ? "冬季0.15：小仓试错，最多配15%配额"
                  : pos.stage === "spring" ? "春季0.45：启动建仓，配45%配额"
                  : pos.stage === "summer" ? "夏季0.75：主仓持有，配75%配额"
                  : pos.stage === "autumn" ? "秋季0.00：目标清零，强制退出"
                  : "未知季节，系数为0"} />
              <FlowItem label={`置信度系数 (conf=${(pos.quantConfidence*100).toFixed(0)}%)`} value={`×${pos.confidenceCoeff.toFixed(2)}`}
                hint="分类引擎越确定，系数越高（0.4~1.0），公式：clamp(0.35+0.9×conf, 0.4, 1.0)" />
              <FlowItem label="波动因子" value={`×${pos.volatilityFactor.toFixed(2)}`}
                hint={pos.volatilityFactor >= 1.0 ? "ATR%≤2%，波动正常，不打折"
                  : pos.volatilityFactor >= 0.85 ? "ATR% 2-4%，波动偏大，打85折"
                  : pos.volatilityFactor >= 0.70 ? "ATR% 4-6%，波动较大，打7折"
                  : "ATR%>6%，波动极大，打5折"} />
              <FlowItem label="周日冲突因子" value={`×${pos.conflictFactor}`}
                hint={pos.conflictFactor < 1.0 ? "周线和日线信号打架，打八折（0.8）" : "周线日线方向一致，不打折"} />
              <FlowItem label="流动性因子" value={`×${pos.liquidityFactor}`}
                hint="成交量好=1.0, 一般=0.8, 差=0.5, 无=0（不可交易）" />
              <FormulaBlock
                formula={`${formatMoney(pos.effectiveQuota)} × ${pos.stageCoeff} × ${pos.confidenceCoeff.toFixed(2)} × ${pos.volatilityFactor.toFixed(2)} × ${pos.conflictFactor} × ${pos.liquidityFactor}`}
                result={formatMoney(pos.rawTargetValue)}
              />
              {pos.rawTargetValue !== pos.finalTargetValue && (
                <div className="border-t border-border/50 mt-1.5 pt-1.5">
                  <FlowItem label="经组合缩放后" value={formatMoney(pos.finalTargetValue)} emphasis color="text-primary"
                    hint={`所有股票原始目标之和超过市场层上限(${Math.round(portfolioCap * 100)}%)，按比例同步缩小`} />
                </div>
              )}
              {pos.concentrationConstraint && (
                <div className="border-t border-border/50 mt-1.5 pt-1.5 space-y-0.5">
                  {pos.concentrationConstraint.industryScale < 1.0 && (
                    <FlowItem
                      label={`行业约束（${pos.concentrationConstraint.industryGroup}）`}
                      value={`×${pos.concentrationConstraint.industryScale.toFixed(2)}`}
                      color="text-[hsl(var(--autumn))]"
                      hint={`${pos.concentrationConstraint.industryGroup} 板块合计超过总资产25%，按比例压缩`}
                    />
                  )}
                  {pos.concentrationConstraint.themeScale < 1.0 && (
                    <FlowItem
                      label={`主题约束（${pos.concentrationConstraint.themeGroup}）`}
                      value={`×${pos.concentrationConstraint.themeScale.toFixed(2)}`}
                      color="text-[hsl(var(--autumn))]"
                      hint={`${pos.concentrationConstraint.themeGroup} 主题合计超过总资产20%，按比例压缩`}
                    />
                  )}
                </div>
              )}
            </div>
          </LayerStep>

          {/* Layer 2.5: Setup 质量层 */}
          <LayerStep
            layerNum="2.5"
            title="质量层 · Setup Quality"
            subtitle="这次信号质量如何？春季该先锋仓还是满仓？"
            outputLabel="可执行目标"
            outputValue={formatMoney(pos.executableTargetValue)}
            outputColor={pos.executableTargetValue < pos.rawTargetValue ? "text-[hsl(var(--autumn))]" : undefined}
          >
            <div className="space-y-0.5">
              <FlowItem label="Setup 评分" value={`${pos.setupScore}/5`}
                hint={pos.setupScore <= 1 ? "0-1分=无效信号，L3 风险预算系数=0（禁止买入）"
                  : pos.setupScore === 2 ? "2分=弱信号，L3 风险预算 ×0.7（买入上限缩减）"
                  : pos.setupScore === 3 ? "3分=正常信号，L3 风险预算 ×1.0"
                  : pos.setupScore === 4 ? "4分=强信号，L3 风险预算 ×1.15"
                  : "5分=极强信号，L3 风险预算 ×1.25"} />
              {pos.springEntryPhase && (
                <FlowItem
                  label="春季阶段"
                  value={pos.springEntryPhase === "pilot" ? "先锋仓 → 释放40%" : "确认仓 → 释放100%"}
                  color={pos.springEntryPhase === "confirmed" ? "text-[hsl(var(--summer))]" : "text-[hsl(var(--autumn))]"}
                  hint={pos.springEntryPhase === "pilot"
                    ? "春季早期不一下打满，先用40%试水。升级到确认仓需要：评分≥3 + 无周日冲突 + (upTurn≥2 或 已浮盈)"
                    : "信号已确认，允许释放全量目标仓位"}
                />
              )}
              {pos.springEntryPhase && (
                <FlowItem label="释放上限" value={formatMoney(pos.springReleaseCap)}
                  hint={pos.springEntryPhase === "pilot" ? "= 原始目标 × 40%，等市场证明你对了再释放剩余" : "= 原始目标 × 100%"} />
              )}
              <div className="border-t border-border/50 mt-1.5 pt-1.5">
                <FlowItem label="输出 → 可执行目标仓位" value={formatMoney(pos.executableTargetValue)} emphasis
                  hint="长期持仓目标，不受单次波动影响；ATR 环境系数在 L3 风险预算层生效，控制每笔订单买入上限" />
              </div>
            </div>
          </LayerStep>

          {/* Layer 3: 风险预算层 */}
          <LayerStep
            layerNum="L3"
            title="风险预算层 · Risk Budget"
            subtitle="这一笔最多能买多少？用可承受亏损反推最多能买多少"
            outputLabel="本笔可买"
            outputValue={isExitScenario ? "减仓场景" : pos.allowedEntryValue > 0 ? formatMoney(pos.allowedEntryValue) : "—"}
            outputColor={isExitScenario ? "text-muted-foreground" : pos.allowedEntryValue > 0 ? "text-[hsl(var(--summer))]" : undefined}
          >
            {(() => {
              const atrMultiplier = pos.stage === "winter" ? 2.5 : 2.0;
              const minStopPct    = pos.stage === "winter" ? 0.08 : 0.05;
              const perShareRisk  = Math.max(atrMultiplier * pos.atr20, pos.currentPrice * minStopPct);
              const maxShares     = pos.riskBudgetValue > 0 && perShareRisk > 0
                ? Math.floor(pos.riskBudgetValue / perShareRisk) : 0;

              return (
                <div className="space-y-1">

                  {/* ─── 段 A：风险预算（最多亏多少） ─── */}
                  <div className="flex items-center gap-2 pb-0.5">
                    <span className="text-[11px] font-medium text-foreground/50 whitespace-nowrap">① 风险预算（最多亏多少）</span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                  <FlowItem label="基础风险% (baseRiskPct)" value={`${(baseRiskPct * 100).toFixed(2)}%`}
                    hint={`市场制度"${regimeLabels[regime]}"对应的基础单笔风险占比`} />
                  <FlowItem label="市场系数 (regimeFactor)" value={`×${regimeFactor}`}
                    hint="市场越弱系数越低：健康多头1.0 → 严冬0.3" />
                  <FlowItem label="ATR环境系数 (atrEnvFactor)" value={`×${pos.atrEnvFactor}`}
                    color={pos.atrEnvFactor < 1.0 ? "text-[hsl(var(--autumn))]" : undefined}
                    hint={pos.atrEnvFactor < 1.0 ? "近期波动异常放大，刹车减少预算" : "近期波动正常，系数=1.0"} />
                  <FlowItem label="回撤系数 (drawdownFactor)" value={`×${pos.drawdownFactor}`}
                    color={pos.drawdownFactor < 1.0 ? "text-[hsl(var(--autumn))]" : undefined}
                    hint={pos.drawdownFactor < 1.0 ? "账户从高点回撤触发刹车（3%→0.75, 6%→0.5, 10%→0.25）" : "账户无明显回撤，系数=1.0"} />
                  <FlowItem label="质量系数 (setupFactor)" value={`×${setupFactor}`}
                    color={setupFactor < 1.0 ? "text-[hsl(var(--autumn))]" : setupFactor > 1.0 ? "text-[hsl(var(--summer))]" : undefined}
                    hint={setupFactor === 0 ? "评分≤1，信号无效，禁止开新仓" : `评分${pos.setupScore}/5 对应系数${setupFactor}`} />
                  <FormulaBlock
                    formula={`${formatMoney(totalAssets)} × ${(baseRiskPct*100).toFixed(2)}% × ${regimeFactor} × ${pos.atrEnvFactor} × ${pos.drawdownFactor} × ${setupFactor}`}
                    result={`${formatMoney(pos.riskBudgetValue)}（最大亏损限额）`}
                  />

                  {/* ─── 段 B：反推可买金额 ─── */}
                  {isExitScenario ? (
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-[11px] font-medium text-foreground/50 whitespace-nowrap">② 反推可买金额</span>
                      <div className="flex-1 h-px bg-border/40" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 py-0.5">
                        <span className="text-[11px] font-medium text-foreground/50 whitespace-nowrap">② 反推可买金额（亏损限额 → 股数 → 金额）</span>
                        <div className="flex-1 h-px bg-border/40" />
                      </div>
                      <FlowItem
                        label={`每股风险 = max(ATR×${atrMultiplier}, 价格×${(minStopPct*100).toFixed(0)}%)`}
                        value={`¥${perShareRisk.toFixed(2)}/股`}
                        hint={`max(${pos.atr20.toFixed(2)}×${atrMultiplier}=¥${(pos.atr20*atrMultiplier).toFixed(2)}, ¥${pos.currentPrice.toFixed(2)}×${(minStopPct*100).toFixed(0)}%=¥${(pos.currentPrice*minStopPct).toFixed(2)})`}
                      />
                      <FlowItem
                        label={`最多股数 = floor(${formatMoney(pos.riskBudgetValue)} ÷ ¥${perShareRisk.toFixed(2)})`}
                        value={`${maxShares.toLocaleString()} 股`}
                        hint="用最大亏损限额除以每股风险，向下取整"
                      />
                      <FlowItem
                        label={`风险反推可买 = ${maxShares.toLocaleString()} × ¥${pos.currentPrice.toFixed(2)}`}
                        value={formatMoney(pos.riskCappedValue)}
                        hint="最多股数乘以当前股价，得到可买金额上限"
                      />
                    </>
                  )}

                  {/* ─── 段 C：三者取最小 ─── */}
                  <div className="flex items-center gap-2 py-0.5">
                    <span className="text-[11px] font-medium text-foreground/50 whitespace-nowrap">③ 最终可买（三者取最小）</span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                  {isExitScenario ? (
                    <FlowItem label="买入上限" value="当前为减仓场景，不适用"
                      color="text-muted-foreground"
                      hint="仓位超出目标或触发止损/止盈，执行减仓操作，不需要计算买入上限" />
                  ) : (
                    <>
                      <FlowItem label="目标缺口" value={pos.positionGap > 0 ? formatMoney(pos.positionGap) : "—"}
                        hint="可执行目标仓位 − 当前持仓，即还需要买多少才到目标" />
                      <FlowItem label="风险反推可买" value={formatMoney(pos.riskCappedValue)}
                        hint="由段②得出" />
                      {pos.liquidityCappedValue > 0 && (
                        <FlowItem label="流动性上限" value={formatMoney(pos.liquidityCappedValue)}
                          hint="= 20日均成交额 × 参与率（good:2%, fair:1%, poor:0.5%），避免冲击市场" />
                      )}
                      <div className="border-t border-border/50 mt-1 pt-1">
                        <FlowItem
                          label="本笔可买 = min(三者)"
                          value={pos.allowedEntryValue > 0 ? formatMoney(pos.allowedEntryValue) : "—"}
                          emphasis
                          color={pos.allowedEntryValue > 0 ? "text-[hsl(var(--summer))]" : undefined}
                          hint="取最保守的那个：想买多少、风险允许多少、流动性能消化多少"
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </LayerStep>

          {/* Layer 4: 执行层 */}
          <LayerStep
            layerNum="L4"
            title="执行层 · Execution"
            subtitle="最终动作：建仓/加仓/持有/减仓/清仓"
            outputLabel="操作"
            outputValue={actionLabels[pos.action]}
            outputColor={pos.action === "enter" || pos.action === "add" ? "text-[hsl(var(--summer))]" : pos.action === "hold" ? "text-muted-foreground" : "text-destructive"}
          >
            <div className="space-y-0.5">
              <FlowItem label="操作建议" value={actionLabels[pos.action]} emphasis
                hint={pos.action === "force_exit" ? "硬止损触发，必须立即清仓（优先级最高）"
                  : pos.action === "reduce" ? "仓位超出目标或出现转弱信号，需要减仓"
                  : pos.action === "exit_autumn" ? "秋季目标仓位为零，执行退出"
                  : pos.action === "take_profit" ? "夏季从最高收盘价回撤超过跟踪止盈线"
                  : pos.action === "enter" ? "新建仓位，符合进场条件"
                  : pos.action === "add" ? "已有浮盈，符合加仓条件（浮盈授权）"
                  : "维持现状，等待更好的信号"} />
              <FlowItem label="优先级" value={`${pos.actionPriority}`}
                hint="0=最紧急(止损) → 5=最不急(持有)，数字越小越优先执行" />
              {pos.hardStopPct != null && (
                <FlowItem label="硬止损" value={`-${pos.hardStopPct.toFixed(1)}%`} color="text-destructive"
                  hint={pos.stage === "winter" ? "冬季止损 = max(8%, 2.5×ATR%)，范围8%-12%" : "春季止损 = max(5%, 2.0×ATR%)，范围5%-10%"} />
              )}
              {pos.trailingStopPct != null && (
                <FlowItem label="跟踪止盈" value={`-${pos.trailingStopPct.toFixed(1)}%`} color="text-[hsl(var(--autumn))]"
                  hint="从持仓以来最高收盘价回撤此比例触发止盈，= max(8%, 2.5×ATR%)" />
              )}
              {pos.costBasis > 0 && (
                <FlowItem
                  label="当前盈亏"
                  value={`${pos.pnlPct > 0 ? "+" : ""}${pos.pnlPct.toFixed(2)}%`}
                  color={pos.pnlPct > 0 ? "text-[hsl(var(--summer))]" : pos.pnlPct < 0 ? "text-destructive" : undefined}
                  hint={pos.pnlPct > 0 ? "持仓盈利中，满足加仓的浮盈授权条件" : pos.pnlPct < 0 ? "持仓亏损中，即使有加仓空间也暂缓（浮盈授权未达）" : "持仓持平"}
                />
              )}
            </div>
          </LayerStep>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex gap-2">
        <button onClick={onRemoveFromPortfolio} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary">
          <Briefcase className="w-3.5 h-3.5" /> 移出仓位管理
        </button>
      </div>
    </div>
  );
}

// =============================================
// Shared sub-components
// =============================================

function RiskReturnBar({ pos }: { pos: StockPositionResult }) {
  // 夏季用跟踪止盈（从最高点回撤），其他季节用硬止损（从成本回撤）
  const isTrailing = pos.hardStopPct == null && pos.trailingStopPct != null;
  const stopDist = Math.abs(pos.hardStopPct ?? pos.trailingStopPct ?? 8);
  const stopLabel = isTrailing ? "跟踪止盈" : "硬止损";
  const pnlPct   = pos.pnlPct;                        // 当前盈亏%（相对成本，可正可负）
  const hasCost  = pos.costBasis > 0;

  // Bar 范围：从止损 (-stopDist) 到 右侧留出与止损等宽的缓冲
  // 总宽 = stopDist + max(pnlPct, 0) + stopDist * 0.5（右侧空间）
  const rightPad = stopDist * 0.5;
  const total    = stopDist + Math.max(pnlPct, 0) + rightPad;

  // 各区段占总宽的百分比
  const redWidthPct   = (stopDist / total) * 100;                        // 红区（止损→成本）
  const greenWidthPct = hasCost ? (Math.max(pnlPct, 0) / total) * 100 : 0; // 绿区（成本→当前，仅盈利时）

  // 圆点位置（从左算起）
  const dotPos = hasCost
    ? Math.max(2, Math.min(97, ((stopDist + pnlPct) / total) * 100))
    : redWidthPct;

  // 距止损的缓冲 = 当前价相对止损价的距离（从成本反推）
  const bufferPct = stopDist + pnlPct;  // 若 pnlPct=+4.6, stop=9.7 → 缓冲14.3%

  return (
    <div className="rounded-lg bg-secondary/50 p-3">
      {/* 顶部标签行 */}
      <div className="flex items-center justify-between text-[10px] mb-1.5">
        <span className="text-muted-foreground">{stopLabel} <span className="text-red-500 font-medium">-{stopDist.toFixed(1)}%</span></span>
        {hasCost && (
          <span className={`font-semibold text-xs ${pnlPct > 0 ? "text-green-500" : pnlPct < 0 ? "text-red-500" : "text-muted-foreground"}`}>
            当前 {pnlPct > 0 ? "+" : ""}{pnlPct.toFixed(1)}%
          </span>
        )}
        <span className="text-muted-foreground">
          距止损 <span className={`font-medium ${bufferPct > stopDist ? "text-green-500" : bufferPct > 0 ? "text-[hsl(var(--autumn))]" : "text-red-500"}`}>
            {bufferPct > 0 ? "+" : ""}{bufferPct.toFixed(1)}%
          </span>
        </span>
      </div>

      {/* 进度条 */}
      <div className="relative h-3">
        {/* 色带层（overflow-hidden 裁剪圆角） */}
        <div className="absolute inset-0 rounded-full bg-secondary overflow-hidden flex">
          {/* 红区：止损 → 成本 */}
          <div className="bg-red-500/25 h-full" style={{ width: `${redWidthPct}%` }} />
          {/* 绿区：成本 → 当前（仅盈利时显示） */}
          {greenWidthPct > 0 && (
            <div className="bg-green-500/30 h-full" style={{ width: `${greenWidthPct}%` }} />
          )}
          {/* 余下空白区 */}
          <div className="flex-1 h-full" />
        </div>

        {/* 成本线（红绿分界，在色带层上方） */}
        <div className="absolute top-0 bottom-0 w-px bg-border z-10" style={{ left: `${redWidthPct}%` }} />

        {/* 当前价圆点（在色带层外，不被 overflow-hidden 截断） */}
        {hasCost && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-background shadow-md z-20 ${
              pnlPct > 0 ? "bg-green-500" : pnlPct < 0 ? "bg-red-500" : "bg-muted-foreground"
            }`}
            style={{ left: `calc(${dotPos}% - 8px)` }}
          />
        )}
      </div>

      {/* 底部轴标签 */}
      <div className="relative text-[9px] text-muted-foreground/60 mt-1 h-3">
        <span className="absolute left-0">止损</span>
        <span className="absolute" style={{ left: `calc(${redWidthPct}% - 10px)` }}>成本</span>
        {hasCost && pnlPct !== 0 && (
          <span className="absolute" style={{ left: `calc(${dotPos}% - 8px)` }}>现价</span>
        )}
      </div>
    </div>
  );
}

function PositionBar({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{formatMoney(value)} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function formatMoney(value: number): string {
  if (Math.abs(value) >= 10000) {
    return `¥${(value / 10000).toFixed(1)}万`;
  }
  return `¥${value.toFixed(0)}`;
}

// ─── 行业分布组件 ───────────────────────────────────────────────

const INDUSTRY_CAP_PCT = 0.25;
const INDUSTRY_COLORS = [
  "bg-[hsl(var(--spring))]", "bg-primary", "bg-[hsl(var(--autumn))]",
  "bg-purple-500", "bg-cyan-500", "bg-pink-500", "bg-yellow-500", "bg-teal-500",
];

function IndustryBreakdown({ positions, totalAssets }: { positions: StockPositionResult[]; totalAssets: number }) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of positions) {
      const key = p.industry || "其他";
      map.set(key, (map.get(key) ?? 0) + p.currentPositionValue);
    }
    const total = [...map.values()].reduce((s, v) => s + v, 0) || 1;
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, val], i) => ({
        name,
        val,
        pct: val / total * 100,
        overLimit: totalAssets > 0 && val > totalAssets * INDUSTRY_CAP_PCT,
        color: INDUSTRY_COLORS[i % INDUSTRY_COLORS.length],
      }));
  }, [positions, totalAssets]);

  if (groups.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>行业分布</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {/* 堆叠条 */}
          <div className="h-2 rounded-full overflow-hidden flex gap-px">
            {groups.map(g => (
              <div
                key={g.name}
                className={`h-full ${g.color} ${g.overLimit ? "opacity-90" : "opacity-60"}`}
                style={{ width: `${g.pct}%` }}
                title={`${g.name} ${g.pct.toFixed(1)}%`}
              />
            ))}
          </div>
          {/* 图例 */}
          <div className="space-y-0.5">
            {groups.map(g => (
              <div key={g.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-sm shrink-0 ${g.color}`} />
                  <span className="text-muted-foreground truncate max-w-[100px]">{g.name}</span>
                  {g.overLimit && <span className="text-[hsl(var(--autumn))]">⚠️</span>}
                </div>
                <span className={`font-medium ${g.overLimit ? "text-[hsl(var(--autumn))]" : "text-foreground"}`}>
                  {g.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Portfolio;
