import { useState, useMemo, useEffect } from "react";
import { useStockPool } from "@/hooks/useStockPool";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useStockClassifications } from "@/hooks/useStockClassification";
import {
  computePortfolio,
  computeATR20,
  computeMarketContext,
  regimeLabels,
  type PositionInput,
  type StockPositionResult,
  type MarketContext,
  type ActionType,
} from "@/lib/positionEngine";
import { seasonLabels, seasonEmojis, type Season } from "@/lib/stockData";
import { AppNav } from "@/components/AppNav";
import { Settings, TrendingUp, Trash2, Loader2, DollarSign, Briefcase, ChevronLeft } from "lucide-react";
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
      const atr20 = computeATR20(dailyBars);
      const shares = pos?.shares ?? 0;
      const positionValue = shares * stock.price;
      return {
        symbol: stock.symbol, name: stock.name, currentPrice: stock.price,
        positionValue, costBasis: pos?.costBasis ?? 0,
        highestCloseSinceEntry: pos?.highestCloseSinceEntry ?? 0, atr20,
        quotaValue: pos?.quotaValue ?? null, industry: pos?.industry ?? stock.sector,
        themeCluster: pos?.themeCluster ?? "", liquidityLevel: pos?.liquidityLevel ?? "good",
      };
    });
  }, [portfolioStocks, positions, dailyBarsMap]);

  const portfolio = useMemo(() => {
    if (!config || portfolioStocks.length === 0) return null;
    const result = computePortfolio(config.totalAssets, config.defaultQuotaPct, positionInputs, classifications);
    // Use all stocks for market context instead of only portfolio stocks
    if (allClassifications.size > 0) {
      result.market = computeMarketContext(allClassifications);
    }
    return result;
  }, [config, positionInputs, classifications, allClassifications, portfolioStocks.length]);

  // Auto-select first stock
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

      {/* Main content: left-right split on desktop, single view on mobile */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: stock list — hidden on mobile when detail is shown */}
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

        {/* Right: detail panel — full width on mobile when shown */}
        <div className={`flex-1 overflow-y-auto ${
          mobileShowDetail ? "flex flex-col" : "hidden md:block"
        }`}>
          {selectedPos ? (
            <DetailPanel
              pos={selectedPos}
              editing={editingPosition}
              posForm={posForm}
              totalAssets={config?.totalAssets ?? 0}
              portfolioCap={portfolio?.market.portfolioCap ?? 0}
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
// Detail Panel
// =============================================

interface DetailPanelProps {
  pos: StockPositionResult;
  editing: boolean;
  posForm: { positionValue: string; costBasis: string; shares: string; quotaValue: string };
  totalAssets: number;
  portfolioCap: number;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onFormChange: (form: { positionValue: string; costBasis: string; shares: string; quotaValue: string }) => void;
  onDelete: () => void;
  onRemoveFromPortfolio: () => void;
}

function DetailPanel({ pos, editing, posForm, totalAssets, portfolioCap, onEdit, onSave, onCancel, onFormChange, onDelete, onRemoveFromPortfolio }: DetailPanelProps) {
  const positionPct = totalAssets > 0 ? (pos.currentPositionValue / totalAssets * 100) : 0;
  const targetPct = totalAssets > 0 ? (pos.finalTargetValue / totalAssets * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 md:space-y-6 max-w-2xl">
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
            <span className="text-sm text-muted-foreground">
              优先级 {pos.actionPriority}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">¥{pos.currentPrice.toFixed(2)}</div>
          {pos.costBasis > 0 && (
            <div className={`text-sm font-medium ${pos.pnlPct > 0 ? "text-[hsl(var(--summer))]" : pos.pnlPct < 0 ? "text-[hsl(var(--spring))]" : "text-muted-foreground"}`}>
              {pos.pnlPct > 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Notes / Action reason */}
      <div className="rounded-lg bg-secondary/50 p-4 space-y-1.5">
        {pos.notes.filter(Boolean).map((note, i) => (
          <p key={i} className="text-sm">{note}</p>
        ))}
      </div>

      {/* Position bar visualization */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">仓位对比</h3>
        <div className="space-y-3">
          <PositionBar label="当前仓位" value={pos.currentPositionValue} pct={positionPct} color="bg-muted-foreground" />
          <PositionBar label="目标仓位" value={pos.finalTargetValue} pct={targetPct} color="bg-primary" />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>差额: <span className={`font-medium ${pos.positionGap > 0 ? "text-[hsl(var(--summer))]" : pos.positionGap < 0 ? "text-[hsl(var(--spring))]" : ""}`}>
            {pos.positionGap > 0 ? "+" : ""}{formatMoney(pos.positionGap)}
          </span></span>
          <span>占总资产 {targetPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Details grid */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">详细参数</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <DetailItem label="当前价" value={`¥${pos.currentPrice.toFixed(2)}`} />
          <DetailItem label="成本价" value={pos.costBasis > 0 ? `¥${pos.costBasis.toFixed(2)}` : "—"} />
          <DetailItem label="盈亏" value={pos.costBasis > 0 ? `${pos.pnlPct.toFixed(1)}%` : "—"}
            color={pos.pnlPct > 0 ? "text-[hsl(var(--summer))]" : pos.pnlPct < 0 ? "text-[hsl(var(--spring))]" : undefined} />
          <DetailItem label="当前仓位" value={formatMoney(pos.currentPositionValue)} />
          <DetailItem label="目标仓位" value={formatMoney(pos.finalTargetValue)} />
          <DetailItem label="有效配额" value={formatMoney(pos.effectiveQuota)} />
          <DetailItem label="置信度" value={`${(pos.quantConfidence * 100).toFixed(0)}%`} />
          <DetailItem label="波动因子" value={pos.volatilityFactor.toFixed(2)} />
          <DetailItem label="冲突因子" value={pos.conflictFactor.toFixed(2)} />
          <DetailItem label="流动性因子" value={pos.liquidityFactor.toFixed(2)} />
          {pos.hardStopPct != null && <DetailItem label="硬止损" value={`-${pos.hardStopPct.toFixed(1)}%`} color="text-destructive" />}
          {pos.trailingStopPct != null && <DetailItem label="跟踪止盈" value={`-${pos.trailingStopPct.toFixed(1)}%`} color="text-[hsl(var(--autumn))]" />}
        </div>
      </div>

      {/* Formula */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">计算公式</h3>
        <div className="rounded-lg bg-secondary p-3 text-xs font-mono leading-relaxed">
          <div className="text-muted-foreground mb-1">raw_target = effective_quota × stageCoeff × confidenceCoeff × volatilityFactor × conflictFactor × liquidityFactor</div>
          <div>
            {formatMoney(pos.effectiveQuota)} × {pos.stageCoeff} × {pos.confidenceCoeff.toFixed(2)} × {pos.volatilityFactor.toFixed(2)} × {pos.conflictFactor} × {pos.liquidityFactor} = <span className="font-semibold">{formatMoney(pos.rawTargetValue)}</span>
          </div>
          {pos.rawTargetValue !== pos.finalTargetValue && (
            <div className="mt-1 text-muted-foreground">
              经组合缩放后: <span className="text-foreground font-semibold">{formatMoney(pos.finalTargetValue)}</span>
              <span className="ml-2">(组合上限 {Math.round(portfolioCap * 100)}%)</span>
            </div>
          )}
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
            <div className="flex gap-2">
              <button onClick={onSave} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">保存</button>
              <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">取消</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
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

function DetailItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium mt-0.5 ${color || ""}`}>{value}</div>
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
