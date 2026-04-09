import { useState, useMemo } from "react";
import { useStockPool } from "@/hooks/useStockPool";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useStockClassifications } from "@/hooks/useStockClassification";
import {
  computePortfolio,
  computeATR20,
  regimeLabels,
  type PositionInput,
  type StockPositionResult,
  type MarketContext,
  type ActionType,
} from "@/lib/positionEngine";
import { seasonLabels, seasonEmojis, type Stock } from "@/lib/stockData";
import { NavLink } from "@/components/NavLink";
import { Settings, TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Plus, Trash2, Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";

const actionLabels: Record<ActionType, string> = {
  force_exit: "强制退出",
  reduce: "减仓",
  exit_autumn: "秋季退出",
  take_profit: "止盈",
  enter: "建仓",
  add: "加仓",
  hold: "持有",
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

const Portfolio = () => {
  const { stocks: stockPool } = useStockPool();
  const { config, positions, loading: portfolioLoading, updateConfig, upsertPosition, removePosition } = usePortfolio();
  const { results: classifications, dailyBarsMap } = useStockClassifications(stockPool);

  const [showConfig, setShowConfig] = useState(false);
  const [editTotalAssets, setEditTotalAssets] = useState("");
  const [editQuotaPct, setEditQuotaPct] = useState("");
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [posForm, setPosForm] = useState({ positionValue: "", costBasis: "", shares: "", quotaValue: "" });

  // Build position inputs from stock pool + positions
  const positionInputs: PositionInput[] = useMemo(() => {
    return stockPool.map((stock) => {
      const pos = positions.find((p) => p.symbol === stock.symbol);
      const dailyBars = dailyBarsMap.get(stock.symbol) || [];
      const atr20 = computeATR20(dailyBars);

      return {
        symbol: stock.symbol,
        name: stock.name,
        currentPrice: stock.price,
        positionValue: pos?.positionValue ?? 0,
        costBasis: pos?.costBasis ?? 0,
        highestCloseSinceEntry: pos?.highestCloseSinceEntry ?? 0,
        atr20,
        quotaValue: pos?.quotaValue ?? null,
        industry: pos?.industry ?? stock.sector,
        themeCluster: pos?.themeCluster ?? "",
        liquidityLevel: pos?.liquidityLevel ?? "good",
      };
    });
  }, [stockPool, positions, dailyBarsMap]);

  // Compute portfolio
  const portfolio = useMemo(() => {
    if (!config || stockPool.length === 0) return null;
    return computePortfolio(
      config.totalAssets,
      config.defaultQuotaPct,
      positionInputs,
      classifications,
    );
  }, [config, positionInputs, classifications, stockPool.length]);

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
      symbol,
      positionValue: parseFloat(posForm.positionValue) || 0,
      costBasis: parseFloat(posForm.costBasis) || 0,
      shares: parseFloat(posForm.shares) || 0,
      quotaValue: posForm.quotaValue ? parseFloat(posForm.quotaValue) : null,
      highestCloseSinceEntry: pos?.highestCloseSinceEntry ?? 0,
      industry: pos?.industry ?? "",
      themeCluster: pos?.themeCluster ?? "",
      liquidityLevel: pos?.liquidityLevel ?? "good",
    });
    setEditingPosition(null);
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
    setEditingPosition(symbol);
  };

  if (portfolioLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-6">
            <span className="text-2xl font-bold tracking-tight">
              <span className="text-[hsl(var(--spring))]">股</span>
              <span className="text-destructive">票</span>
              <span className="text-[hsl(var(--autumn))]">四</span>
              <span className="text-primary">季</span>
            </span>
            <NavLink />
          </div>
          <button
            onClick={() => {
              if (config) {
                setEditTotalAssets(config.totalAssets.toString());
                setEditQuotaPct(config.defaultQuotaPct.toString());
              }
              setShowConfig(!showConfig);
            }}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        {/* Config panel */}
        {showConfig && config && (
          <div className="rounded-lg border border-border p-4 bg-card space-y-4">
            <h3 className="font-semibold text-sm">组合配置</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">总资产</label>
                <input
                  type="number"
                  value={editTotalAssets}
                  onChange={(e) => setEditTotalAssets(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">默认配额 (%)</label>
                <input
                  type="number"
                  value={editQuotaPct}
                  onChange={(e) => setEditQuotaPct(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                />
              </div>
            </div>
            <button
              onClick={handleSaveConfig}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              保存
            </button>
          </div>
        )}

        {/* Market context */}
        {portfolio && <MarketPanel market={portfolio.market} />}

        {/* Portfolio summary */}
        {portfolio && config && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="总资产" value={formatMoney(config.totalAssets)} />
            <SummaryCard label="持仓总值" value={formatMoney(portfolio.totalPositionValue)} />
            <SummaryCard label="目标总值" value={formatMoney(portfolio.totalTargetValue)} />
            <SummaryCard label="现金" value={formatMoney(portfolio.cashRemaining)} />
          </div>
        )}

        {/* Position list */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">操作建议</h2>
          {portfolio?.positions.map((pos) => (
            <PositionCard
              key={pos.symbol}
              pos={pos}
              expanded={expandedSymbol === pos.symbol}
              editing={editingPosition === pos.symbol}
              posForm={posForm}
              onToggle={() => setExpandedSymbol(expandedSymbol === pos.symbol ? null : pos.symbol)}
              onEdit={() => startEditPosition(pos.symbol)}
              onSave={() => handleSavePosition(pos.symbol)}
              onCancel={() => setEditingPosition(null)}
              onFormChange={setPosForm}
              onDelete={() => removePosition(pos.symbol)}
            />
          ))}
          {(!portfolio || portfolio.positions.length === 0) && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              股票池为空，请先在四季分析页面添加股票
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// =============================================
// Sub-components
// =============================================

function MarketPanel({ market }: { market: MarketContext }) {
  const tempColor = market.temperature > 60 ? "text-[hsl(var(--summer))]"
    : market.temperature > 40 ? "text-[hsl(var(--autumn))]"
    : market.temperature > 20 ? "text-[hsl(var(--spring))]"
    : "text-primary";

  return (
    <div className="rounded-lg border border-border p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> 市场环境
        </h3>
        <span className={`text-2xl font-bold ${tempColor}`}>
          {Math.round(market.temperature)}°
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-1 rounded text-xs font-medium bg-secondary text-secondary-foreground">
          {regimeLabels[market.regime]}
        </span>
        <span className="text-xs text-muted-foreground">
          总仓位上限 {Math.round(market.portfolioCap * 100)}%
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <SeasonShare label="❄️ 冬" value={market.winterShare} />
        <SeasonShare label="🌱 春" value={market.springShare} />
        <SeasonShare label="☀️ 夏" value={market.summerShare} />
        <SeasonShare label="🍂 秋" value={market.autumnShare} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
        <FactorBadge label="进攻" value={market.strength} />
        <FactorBadge label="脆弱" value={market.fragility} />
        <FactorBadge label="防御" value={market.riskOff} />
      </div>
    </div>
  );
}

function SeasonShare({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{Math.round(value * 100)}%</div>
    </div>
  );
}

function FactorBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-xs px-2 py-1 rounded bg-secondary">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{(value * 100).toFixed(1)}%</div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  );
}

interface PositionCardProps {
  pos: StockPositionResult;
  expanded: boolean;
  editing: boolean;
  posForm: { positionValue: string; costBasis: string; shares: string; quotaValue: string };
  onToggle: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onFormChange: (form: { positionValue: string; costBasis: string; shares: string; quotaValue: string }) => void;
  onDelete: () => void;
}

function PositionCard({ pos, expanded, editing, posForm, onToggle, onEdit, onSave, onCancel, onFormChange, onDelete }: PositionCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between hover:bg-secondary/50 transition-colors">
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[pos.action]}`}>
            {actionLabels[pos.action]}
          </span>
          <div className="text-left">
            <span className="text-sm font-medium">{pos.name}</span>
            <span className="text-xs text-muted-foreground ml-2">{pos.symbol}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <div className="text-muted-foreground">
              {pos.stage !== "unknown" && `${seasonEmojis[pos.stage]} ${seasonLabels[pos.stage]}`}
            </div>
            <div className={`font-medium ${pos.positionGap > 0 ? "text-[hsl(var(--summer))]" : pos.positionGap < 0 ? "text-[hsl(var(--spring))]" : "text-muted-foreground"}`}>
              {pos.positionGap > 0 ? "+" : ""}{formatMoney(pos.positionGap)}
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          {/* Notes */}
          <div className="mt-3 space-y-1">
            {pos.notes.filter(Boolean).map((note, i) => (
              <p key={i} className="text-xs text-muted-foreground">{note}</p>
            ))}
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
            <DetailItem label="当前价" value={`¥${pos.currentPrice.toFixed(2)}`} />
            <DetailItem label="成本价" value={pos.costBasis > 0 ? `¥${pos.costBasis.toFixed(2)}` : "—"} />
            <DetailItem label="盈亏" value={pos.costBasis > 0 ? `${pos.pnlPct.toFixed(1)}%` : "—"} color={pos.pnlPct > 0 ? "text-[hsl(var(--summer))]" : pos.pnlPct < 0 ? "text-[hsl(var(--spring))]" : undefined} />
            <DetailItem label="当前仓位" value={formatMoney(pos.currentPositionValue)} />
            <DetailItem label="目标仓位" value={formatMoney(pos.finalTargetValue)} />
            <DetailItem label="有效配额" value={formatMoney(pos.effectiveQuota)} />
            <DetailItem label="置信度" value={`${(pos.quantConfidence * 100).toFixed(0)}%`} />
            <DetailItem label="波动因子" value={pos.volatilityFactor.toFixed(2)} />
            {pos.hardStopPct && <DetailItem label="硬止损" value={`-${pos.hardStopPct.toFixed(1)}%`} color="text-destructive" />}
            {pos.trailingStopPct && <DetailItem label="跟踪止盈" value={`-${pos.trailingStopPct.toFixed(1)}%`} color="text-[hsl(var(--autumn))]" />}
          </div>

          {/* Coefficient breakdown */}
          <div className="mt-3 p-2 rounded bg-secondary text-xs">
            <span className="text-muted-foreground">公式: </span>
            <span className="font-mono">
              {formatMoney(pos.effectiveQuota)} × {pos.stageCoeff} × {pos.confidenceCoeff.toFixed(2)} × {pos.volatilityFactor.toFixed(2)} × {pos.conflictFactor} × {pos.liquidityFactor} = {formatMoney(pos.rawTargetValue)}
            </span>
          </div>

          {/* Edit position */}
          {editing ? (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">持仓市值</label>
                  <input type="number" value={posForm.positionValue} onChange={(e) => onFormChange({ ...posForm, positionValue: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 rounded border border-input bg-background text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">成本价</label>
                  <input type="number" value={posForm.costBasis} onChange={(e) => onFormChange({ ...posForm, costBasis: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 rounded border border-input bg-background text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">持仓数量</label>
                  <input type="number" value={posForm.shares} onChange={(e) => onFormChange({ ...posForm, shares: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 rounded border border-input bg-background text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">配额 (可选)</label>
                  <input type="number" value={posForm.quotaValue} onChange={(e) => onFormChange({ ...posForm, quotaValue: e.target.value })}
                    className="w-full mt-1 px-2 py-1.5 rounded border border-input bg-background text-xs" placeholder="留空用默认" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onSave} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90">保存</button>
                <button onClick={onCancel} className="px-3 py-1.5 rounded bg-secondary text-secondary-foreground text-xs">取消</button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button onClick={onEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80">
                <DollarSign className="w-3 h-3" /> 编辑持仓
              </button>
              <button onClick={onDelete} className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3 h-3" /> 删除
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-medium ${color || ""}`}>{value}</div>
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
