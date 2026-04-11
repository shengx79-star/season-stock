import { useState, useMemo, useEffect } from "react";
import { useStockPool } from "@/hooks/useStockPool";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useStockClassifications } from "@/hooks/useStockClassification";
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
import { Settings, TrendingUp, Trash2, Loader2, DollarSign, Briefcase, ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
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
    return computePortfolio(
      config.totalAssets, 100000, positionInputs, classifications,
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
      <header className="border-b border-border px-4 md:px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-6 min-w-0">
            {mobileShowDetail && selectedSymbol ? (
              <button onClick={() => setMobileShowDetail(false)} className="md:hidden p-1 -ml-1 rounded hover:bg-secondary">
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : null}
            <span className="text-xl md:text-2xl font-bold tracking-tight">
              <span className="text-[hsl(var(--spring))]">股</span>
              <span className="text-destructive">票</span>
              <span className="text-[hsl(var(--autumn))]">四</span>
              <span className="text-primary">季</span>
            </span>
            <AppNav />
          </div>
          <button
            onClick={() => {
              if (config) { setEditTotalAssets(config.totalAssets.toString()); setEditQuotaPct(config.defaultQuotaPct.toString()); }
              setShowConfig(!showConfig);
            }}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Config panel */}
      {showConfig && config && (
        <div className="border-b border-border px-6 py-4 bg-card">
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
            <div className="p-3 border-b border-border bg-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {regimeLabels[portfolio.market.regime]}
                </span>
                <span className={`text-sm font-bold flex items-center gap-1 ${
                  portfolio.market.temperature > 60 ? "text-[hsl(var(--summer))]"
                  : portfolio.market.temperature > 40 ? "text-[hsl(var(--autumn))]"
                  : portfolio.market.temperature > 20 ? "text-[hsl(var(--spring))]"
                  : "text-primary"
                }`}>
                  <span className="text-xs font-normal text-muted-foreground">市场热度</span>
                  {Math.round(portfolio.market.temperature)}°
                </span>
              </div>
              <div className="flex gap-1 text-[10px] flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-secondary">仓位上限 {Math.round(portfolio.market.portfolioCap * 100)}%</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary">持仓 {formatMoney(portfolio.totalPositionValue)}</span>
              </div>
            </div>
          )}

          {/* Filter & sort chips */}
          <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1.5">
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
          </div>

          {/* Stock list */}
          <div className="flex-1 overflow-y-auto">
            {filteredPositions.map((pos) => (
              <button
                key={pos.symbol}
                onClick={() => { setSelectedSymbol(pos.symbol); setEditingPosition(false); setMobileShowDetail(true); }}
                className={`w-full px-3 py-2.5 text-left border-l-3 border-b border-border transition-colors ${
                  selectedSymbol === pos.symbol
                    ? `bg-primary/5 ${actionBorderColors[pos.action]}`
                    : `hover:bg-secondary/50 border-l-transparent`
                }`}
              >
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
                    <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                      <span className="text-muted-foreground">现价 ¥{pos.currentPrice.toFixed(2)}</span>
                      {pos.currentPositionValue > 0 && (
                        <span className="text-muted-foreground">持仓 {formatMoney(pos.currentPositionValue)}</span>
                      )}
                      {pos.costBasis > 0 && (
                        <span className={`font-medium ${pos.pnlPct > 0 ? "text-green-500" : pos.pnlPct < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {pos.pnlPct > 0 ? "+" : ""}{pos.pnlPct.toFixed(1)}%
                        </span>
                      )}
                    </div>
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
                  </div>
                </div>
              </button>
            ))}
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
      <div className="absolute left-5 top-10 bottom-0 w-px bg-border" />

      <div className="relative">
        {/* Layer number badge */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center shrink-0 z-10 bg-background">
            <span className="text-xs font-bold text-primary">{layerNum}</span>
          </div>
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setOpen(!open)}
              className="w-full text-left flex items-center justify-between group"
            >
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">{outputLabel}</div>
                  <div className={`text-sm font-bold ${outputColor || ""}`}>{outputValue}</div>
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {open && (
              <div className="mt-2 mb-1 rounded-lg bg-secondary/40 border border-border/50 p-3">
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
  market: MarketContext | null;
  onSave: () => void;
  onFormChange: (form: { positionValue: string; costBasis: string; shares: string; quotaValue: string }) => void;
  onRemoveFromPortfolio: () => void;
}

function DetailPanel({ pos, posForm, totalAssets, market, onSave, onFormChange, onRemoveFromPortfolio }: DetailPanelProps) {
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

  // P2: 有效配额来源判断（无上限，直接用自定义或默认10万）
  const quotaIsDefault = Math.abs(pos.effectiveQuota - 100000) < 1;

  // P3: 是否为减仓/退出场景
  const isExitScenario = pos.action === "reduce" || pos.action === "exit_autumn" || pos.action === "force_exit" || pos.action === "take_profit";

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{pos.name}</h2>
            <span className="text-sm text-muted-foreground">{pos.symbol}</span>
            {pos.stage !== "unknown" && (
              <span className="text-sm">{seasonEmojis[pos.stage]} {seasonLabels[pos.stage]}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2.5 py-1 rounded text-xs font-semibold ${actionColors[pos.action]}`}>
              {actionLabels[pos.action]}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">¥{pos.currentPrice.toFixed(2)}</div>
          {pos.costBasis > 0 && (
            <div className={`text-sm font-medium ${pos.pnlPct > 0 ? "text-[hsl(var(--summer))]" : pos.pnlPct < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {"\n"}
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
                  placeholder="默认10万"
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

export default Portfolio;
