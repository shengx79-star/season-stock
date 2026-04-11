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
                <span className={`text-sm font-bold ${
                  portfolio.market.temperature > 60 ? "text-[hsl(var(--summer))]"
                  : portfolio.market.temperature > 40 ? "text-[hsl(var(--autumn))]"
                  : portfolio.market.temperature > 20 ? "text-[hsl(var(--spring))]"
                  : "text-primary"
                }`}>
                  {Math.round(portfolio.market.temperature)}°
                </span>
              </div>
              <div className="flex gap-1 text-[10px] flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-secondary">仓位上限 {Math.round(portfolio.market.portfolioCap * 100)}%</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary">持仓 {formatMoney(portfolio.totalPositionValue)}</span>
              </div>
            </div>
          )}

          {/* Stock list */}
          <div className="flex-1 overflow-y-auto">
            {portfolio?.positions.map((pos) => (
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
                        <span className={`font-medium ${pos.pnlPct > 0 ? "text-[hsl(var(--summer))]" : pos.pnlPct < 0 ? "text-destructive" : "text-muted-foreground"}`}>
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
            {(!portfolio || portfolio.positions.length === 0) && (
              <div className="p-6 text-center text-muted-foreground text-xs">
                请在四季分析页面标记股票进入仓位管理
              </div>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
        <div className={`flex-1 overflow-y-auto ${
          mobileShowDetail ? "flex flex-col" : "hidden md:block"
        }`}>
          {selectedPos ? (
            <DetailPanel
              pos={selectedPos}
              editing={editingPosition}
              posForm={posForm}
              totalAssets={config?.totalAssets ?? 0}
              market={portfolio?.market ?? null}
              onEdit={() => startEditPosition(selectedPos.symbol)}
              onSave={() => handleSavePosition(selectedPos.symbol)}
              onCancel={() => setEditingPosition(false)}
              onFormChange={setPosForm}
              onDelete={() => { removePosition(selectedPos.symbol); setSelectedSymbol(null); setMobileShowDetail(false); }}
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
  editing: boolean;
  posForm: { positionValue: string; costBasis: string; shares: string; quotaValue: string };
  totalAssets: number;
  market: MarketContext | null;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onFormChange: (form: { positionValue: string; costBasis: string; shares: string; quotaValue: string }) => void;
  onDelete: () => void;
  onRemoveFromPortfolio: () => void;
}

function DetailPanel({ pos, editing, posForm, totalAssets, market, onEdit, onSave, onCancel, onFormChange, onDelete, onRemoveFromPortfolio }: DetailPanelProps) {
  const positionPct = totalAssets > 0 ? (pos.currentPositionValue / totalAssets * 100) : 0;
  const targetPct = totalAssets > 0 ? (pos.finalTargetValue / totalAssets * 100) : 0;
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


      {/* Position bar */}
      <div className="space-y-2">
        <PositionBar label="当前仓位" value={pos.currentPositionValue} pct={positionPct} color="bg-muted-foreground" />
        <PositionBar label="目标仓位" value={pos.finalTargetValue} pct={targetPct} color="bg-primary" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>差额: <span className={`font-medium ${pos.positionGap > 0 ? "text-[hsl(var(--summer))]" : pos.positionGap < 0 ? "text-[hsl(var(--spring))]" : ""}`}>
            {pos.positionGap > 0 ? "+" : ""}{formatMoney(pos.positionGap)}
          </span></span>
          <span>占总资产 {targetPct.toFixed(1)}%</span>
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
            title="Setup 质量层"
            subtitle="这次信号质量如何？春季该先锋仓还是满仓？"
            outputLabel="可执行目标"
            outputValue={formatMoney(pos.executableTargetValue)}
            outputColor={pos.executableTargetValue < pos.rawTargetValue ? "text-[hsl(var(--autumn))]" : undefined}
          >
            <div className="space-y-0.5">
              {/* 层级说明 */}
              <div className="rounded-md bg-muted/50 border border-border/40 px-3 py-2 text-xs text-muted-foreground space-y-1.5 mb-2">
                <p className="font-medium text-foreground/80">为什么是"2.5"而不是单独一层？</p>
                <p>它不改变长期目标仓位（L2 输出），只改变"现在能执行多少"以及 L3 风险预算的上限系数，是 L2 和 L3 之间的质量门控。</p>
                <div className="space-y-1 pt-0.5">
                  <p className="font-medium text-foreground/70">① Setup 评分（0–5 分）—— 由置信度自动映射</p>
                  <p>≤1 → 信号太弱，风险预算系数归零（禁止买入）</p>
                  <p>2 → 弱信号，风险预算打 7 折</p>
                  <p>3–5 → 正常到极强，风险预算按比例放大</p>
                </div>
                <div className="space-y-1 pt-0.5">
                  <p className="font-medium text-foreground/70">② 春季先锋仓 / 确认仓（仅春季触发）</p>
                  <p>先锋仓（pilot）：先释放 40% 目标仓位试水</p>
                  <p>确认仓（confirmed）：评分≥3 + 无周日冲突 + (upTurn≥2 或 已浮盈) → 才释放全量</p>
                </div>
              </div>
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
            <div className="space-y-0.5">
              <FlowItem label="基础风险% (baseRiskPct)" value={`${(baseRiskPct * 100).toFixed(2)}%`}
                hint={`市场制度"${regimeLabels[regime]}"对应的基础单笔风险占比，决定这笔最多亏多少`} />
              <FlowItem label="市场系数 (regimeFactor)" value={`×${regimeFactor}`}
                hint="市场越弱，系数越低（健康多头1.0 → 严冬0.3），进一步压缩风险预算" />
              <FlowItem label="ATR环境系数 (atrEnvFactor)" value={`×${pos.atrEnvFactor}`}
                hint={pos.atrEnvFactor < 1.0 ? "近期波动异常放大，刹车减少预算" : "近期波动正常，系数=1.0"} />
              <FlowItem label="回撤系数 (drawdownFactor)" value={`×${pos.drawdownFactor}`}
                hint={pos.drawdownFactor < 1.0 ? "账户从高点回撤触发刹车（3%→0.75, 6%→0.5, 10%→0.25）" : "账户无明显回撤，系数=1.0"} />
              <FlowItem label="质量系数 (setupFactor)" value={`×${setupFactor}`}
                hint={setupFactor === 0 ? "评分≤1，信号无效，禁止开新仓" : `评分${pos.setupScore}/5 对应系数${setupFactor}（2→0.7, 3→1.0, 4→1.15, 5→1.25）`} />
              <FormulaBlock
                formula={`${formatMoney(totalAssets)} × ${(baseRiskPct*100).toFixed(2)}% × ${regimeFactor} × ${pos.atrEnvFactor} × ${pos.drawdownFactor} × ${setupFactor}`}
                result={formatMoney(pos.riskBudgetValue)}
              />
              <FlowItem label="风险反推可买" value={isExitScenario ? "—" : formatMoney(pos.riskCappedValue)}
                hint={isExitScenario ? "当前为减仓/退出场景，买入上限不适用" : "每股风险 = max(ATR×倍数, 价格×最小止损%)，最多股数 = 风险预算÷每股风险，再乘以价格"} />
              {pos.liquidityCappedValue > 0 && (
                <FlowItem label="流动性上限" value={formatMoney(pos.liquidityCappedValue)}
                  hint="= 20日平均成交额 × 参与率(good:2%, fair:1%, poor:0.5%)，避免买太多导致滑点" />
              )}
              {pos.drawdownFactor < 1.0 && (
                <FlowItem label="回撤刹车" value={`×${pos.drawdownFactor}`} color="text-[hsl(var(--autumn))]"
                  hint={pos.drawdownFactor <= 0.25 ? "账户从高点跌超10%，强力刹车×0.25"
                    : pos.drawdownFactor <= 0.5 ? "账户从高点跌6-10%，中度刹车×0.50"
                    : "账户从高点跌3-6%，轻度刹车×0.75"} />
              )}
              <div className="border-t border-border/50 mt-1.5 pt-1.5">
                <FlowItem
                  label={isExitScenario ? "输出 → 买入上限" : "输出 → min(缺口, 风险反推, 流动性)"}
                  value={isExitScenario ? "当前为减仓场景，买入上限不适用" : pos.allowedEntryValue > 0 ? formatMoney(pos.allowedEntryValue) : "—"}
                  emphasis
                  color={isExitScenario ? "text-muted-foreground" : pos.allowedEntryValue > 0 ? "text-[hsl(var(--summer))]" : undefined}
                  hint={isExitScenario ? "仓位超出目标或触发止损/止盈，执行减仓操作，不需要买入上限" : "三者取最小值，确保每笔交易不超过风险和流动性限制"}
                />
              </div>
            </div>
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

      {/* Edit position */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">持仓数据</h3>
        {editing ? (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">持仓数量</label>
                <input type="number" value={posForm.shares} onChange={(e) => onFormChange({ ...posForm, shares: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">成本价</label>
                <input type="number" value={posForm.costBasis} onChange={(e) => onFormChange({ ...posForm, costBasis: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">持仓市值 (自动计算)</label>
                <div className="w-full mt-1 px-3 py-2 rounded-md bg-secondary text-sm text-muted-foreground">
                  ¥{((parseFloat(posForm.shares) || 0) * pos.currentPrice).toFixed(2)}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">配额 (可选)</label>
                <input type="number" value={posForm.quotaValue} onChange={(e) => onFormChange({ ...posForm, quotaValue: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm" placeholder="留空用默认" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={onSave} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">保存</button>
              <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">取消</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80">
              <DollarSign className="w-4 h-4" /> 编辑持仓
            </button>
            <button onClick={onDelete} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10">
              <Trash2 className="w-4 h-4" /> 删除持仓
            </button>
            <button onClick={onRemoveFromPortfolio} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary">
              <Briefcase className="w-4 h-4" /> 移出仓位管理
            </button>
          </div>
        )}
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
