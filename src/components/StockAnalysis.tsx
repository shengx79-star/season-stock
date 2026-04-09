import { Stock, seasonLabels, seasonDescriptions, seasonEmojis, Season } from "@/lib/stockData";
import { ClassificationResult, Candle } from "@/lib/stockClassifier";
import { SeasonBadge } from "./SeasonBadge";
import { SeasonScoreBar } from "./SeasonScoreBar";
import { ScoreBreakdownPanel } from "./ScoreBreakdownPanel";
import { KlineChart } from "./MiniKlineChart";
import { ArrowLeft, BarChart3, Activity, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";

interface StockAnalysisProps {
  stock: Stock;
  classification?: ClassificationResult;
  dailyBars?: Candle[];
  onBack: () => void;
}

const analysisTexts: Record<string, string[]> = {
  spring: [
    "该股票正处于复苏阶段，技术指标显示底部形态已经确立。",
    "MACD出现金叉信号，成交量温和放大，显示资金开始进场。",
    "建议关注突破确认后的加仓机会，设置好止损位。",
    "基本面改善迹象明显，行业景气度有望回升。",
  ],
  summer: [
    "该股票正处于强势上涨周期，趋势动能充沛。",
    "均线系统多头排列，RSI维持在强势区间运行。",
    "成交量持续活跃，主力资金持续流入，市场情绪乐观。",
    "建议持股待涨，关注阶段性高点的获利了结时机。",
  ],
  autumn: [
    "该股票已进入高位震荡阶段，上涨动能逐步减弱。",
    "技术面出现顶背离信号，成交量开始萎缩。",
    "部分资金开始获利了结，需警惕趋势反转风险。",
    "建议逐步减仓，锁定利润，等待更明确的方向信号。",
  ],
  winter: [
    "该股票处于下行通道，市场信心不足。",
    "均线空头排列，KDJ指标持续低位运行。",
    "成交量极度萎缩，场内资金观望情绪浓厚。",
    "建议耐心等待底部信号出现，不宜盲目抄底。",
  ],
};

export const StockAnalysis = ({ stock, classification, dailyBars, onBack }: StockAnalysisProps) => {
  const [visibleLines, setVisibleLines] = useState(0);
  const season = (classification?.stage !== "unknown" ? classification?.stage : stock.season) as Season;
  const lines = analysisTexts[season] || analysisTexts.spring;
  const isUp = stock.change >= 0;

  useEffect(() => {
    setVisibleLines(0);
    const timer = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= lines.length) { clearInterval(timer); return prev; }
        return prev + 1;
      });
    }, 400);
    return () => clearInterval(timer);
  }, [stock.symbol, lines.length]);

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> 返回搜索
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">{stock.symbol}</h1>
            <SeasonBadge
              season={season}
              confidence={classification?.confidence}
              confidenceLevel={classification?.confidenceLevel}
            />
          </div>
          <p className="text-muted-foreground mt-1">{stock.name} · {stock.sector}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-foreground">${stock.price.toFixed(2)}</p>
          <p className={`text-sm font-medium mt-1 ${isUp ? "text-[hsl(var(--spring))]" : "text-destructive"}`}>
            {isUp ? "+" : ""}{stock.change.toFixed(2)} ({isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%)
          </p>
        </div>
      </div>

      {/* K-line Chart */}
      {dailyBars && dailyBars.length > 2 && (
        <div className="rounded-2xl border border-border p-4 mb-6">
          <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">价格走势 (90日)</h3>
          <KlineChart dailyBars={dailyBars} season={season} bars={90} height={180} />
        </div>
      )}

      {/* Season Score */}
      {classification && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">季节温度</span>
            <span className="text-xs font-medium text-foreground">{classification.seasonScore}/100</span>
          </div>
          <SeasonScoreBar score={classification.seasonScore} />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="w-4 h-4" /> <span className="text-xs">市值</span>
          </div>
          <p className="text-lg font-medium text-foreground">{stock.marketCap}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <BarChart3 className="w-4 h-4" /> <span className="text-xs">成交量</span>
          </div>
          <p className="text-lg font-medium text-foreground">{stock.volume}</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Activity className="w-4 h-4" /> <span className="text-xs">市盈率</span>
          </div>
          <p className="text-lg font-medium text-foreground">{stock.pe > 0 ? stock.pe.toFixed(1) : "亏损"}</p>
        </div>
      </div>

      {/* Season status */}
      <div className={`rounded-2xl p-5 mb-6 bg-${season}-light`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{seasonEmojis[season]}</span>
          <h2 className={`text-lg font-bold text-${season}-foreground`}>
            当前状态：{seasonLabels[season]} — {seasonDescriptions[season]}
          </h2>
        </div>
      </div>

      {/* V2 Score Breakdown */}
      {classification && classification.stage !== "unknown" && (
        <div className="rounded-2xl border border-border p-6 mb-6">
          <h3 className="font-medium text-foreground mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">V2</span>
            </span>
            量化评分明细
          </h3>
          <ScoreBreakdownPanel result={classification} />
        </div>
      )}

      {/* Classification Notes */}
      {classification && classification.notes.length > 0 && (
        <div className="rounded-2xl border border-border p-6 mb-6">
          <h3 className="font-medium text-foreground mb-3">📋 分类依据</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {classification.notes.map((note, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed">
                • {note}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* AI Analysis */}
      <div className="rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold">AI</span>
          </div>
          <h3 className="font-medium text-foreground">智能分析</h3>
        </div>
        <div className="space-y-3">
          {lines.map((line, i) => (
            <p
              key={i}
              className={`text-sm text-muted-foreground leading-relaxed transition-all duration-500 ${
                i < visibleLines ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};
