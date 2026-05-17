import { Stock } from "@/lib/stockData";
import { ClassificationResult, Candle } from "@/lib/stockClassifier";
import { SeasonBadge } from "./SeasonBadge";
import { SeasonScoreBar } from "./SeasonScoreBar";
import { MiniKlineChart } from "./MiniKlineChart";
import { TrendingUp, TrendingDown, X, Briefcase } from "lucide-react";
import { Season } from "@/lib/stockData";
import { detectMarketLabel, getMarketColorClass } from "@/lib/marketDetect";
import { RealtimeQuote } from "@/hooks/useRealtimePrices";
import { computeCompositeRating, RATING_STYLE } from "@/lib/ratingEngine";

const SEASON_LABEL: Record<string, string> = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const SEASON_COLOR: Record<string, string> = {
  spring: "text-[hsl(var(--spring))]",
  summer: "text-[hsl(var(--summer))]",
  autumn: "text-[hsl(var(--autumn))]",
  winter: "text-[hsl(var(--winter))]",
};

interface StockCardProps {
  stock: Stock;
  classification?: ClassificationResult;
  dailyBars?: Candle[];
  liveQuote?: RealtimeQuote;
  onClick: (stock: Stock) => void;
  onDelete?: (symbol: string) => void;
  onTogglePortfolio?: (symbol: string, value: boolean) => void;
}

export const StockCard = ({ stock, classification, dailyBars, liveQuote, onClick, onDelete, onTogglePortfolio }: StockCardProps) => {
  const livePrice = liveQuote?.price ?? stock.price;
  const liveChange = liveQuote?.changePercent ?? stock.changePercent;
  const isUp = liveChange >= 0;
  const season = (classification?.stage !== "unknown" ? classification?.stage : stock.season) as Season;
  const confidence = classification?.confidence;
  const confidenceLevel = classification?.confidenceLevel;
  const seasonScore = classification?.seasonScore ?? 50;
  const inPortfolio = !!stock.inPortfolio;
  const marketLabel = detectMarketLabel(stock.symbol);
  const marketColor = getMarketColorClass(marketLabel);

  return (
    <div className="stock-card relative group" onClick={() => onClick(stock)}>
      <div className="absolute -top-1 -right-1 z-10 flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        {onTogglePortfolio && (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePortfolio(stock.symbol, !inPortfolio); }}
            className={`p-1 rounded-full transition-colors ${inPortfolio ? "bg-primary/20 text-primary" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"}`}
            title={inPortfolio ? "移出仓位管理" : "纳入仓位管理"}
          >
            <Briefcase className="w-3 h-3 md:w-3.5 md:h-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(stock.symbol); }}
            className="p-1 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive"
            title="删除"
          >
            <X className="w-3 h-3 md:w-3.5 md:h-3.5" />
          </button>
        )}
      </div>
      {inPortfolio && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary">
          <Briefcase className="w-3 h-3" />
          <span className="text-[10px] font-medium">持仓</span>
        </div>
      )}
      <div className="flex items-start justify-between mb-2 md:mb-3">
        <div>
          <h3 className="text-base md:text-lg font-medium text-foreground flex items-center gap-1.5">
            {stock.symbol}
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${marketColor}`}>{marketLabel}</span>
          </h3>
          <p className="text-xs md:text-sm text-muted-foreground">{stock.name}</p>
        </div>
        <SeasonBadge
          season={season}
          size="sm"
          confidence={confidence}
          confidenceLevel={confidenceLevel}
        />
      </div>

      {dailyBars && dailyBars.length > 2 && (
        <MiniKlineChart dailyBars={dailyBars} season={season} bars={30} height={40} className="mb-1.5 md:mb-2 -mx-1" />
      )}

      {classification && (
        <div className="mb-2 md:mb-3">
          <SeasonScoreBar score={seasonScore} />
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xl md:text-2xl font-medium text-foreground">¥{livePrice.toFixed(2)}</p>
          <div className={`flex items-center gap-1 mt-0.5 text-xs md:text-sm font-medium ${isUp ? "text-[hsl(var(--spring))]" : "text-destructive"}`}>
            {isUp ? <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <TrendingDown className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            <span>{isUp ? "+" : ""}{liveChange.toFixed(2)}%</span>
          </div>
        </div>
        <div className="text-right text-[10px] md:text-xs text-muted-foreground space-y-0.5 md:space-y-1">
          <p>市值 {stock.marketCap}</p>
          <p>量 {liveQuote?.volume ?? stock.volume}</p>
        </div>
      </div>

      {/* 今日 K 线进度条 */}
      {liveQuote && liveQuote.high > 0 && liveQuote.low > 0 && liveQuote.open > 0 && (
        <TodayCandle quote={liveQuote} />
      )}

      {classification && classification.stage !== "unknown" && (() => {
        const rating = computeCompositeRating(classification, stock.symbol);
        const style = RATING_STYLE[rating.level];
        const mt = classification.mediumTermAnalysis;
        const vs = classification.volumeStage;
        const priceBull = classification.stage === "spring" || classification.stage === "summer";
        const volBull   = vs === "spring" || vs === "summer";
        const volSync   = vs !== "unknown" && (priceBull === volBull);
        const volDiverge = vs !== "unknown" && (priceBull !== volBull);

        return (
          <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-border space-y-1.5">

            {/* 综合评级 */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] md:text-xs text-muted-foreground">综合评级</span>
              <span className={`px-2 py-0.5 rounded text-[10px] md:text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                {rating.level}
              </span>
            </div>

            {/* 分解依据 */}
            <div className="space-y-0.5">
              {rating.factors.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] md:text-xs">
                  <span className={f.score > 0 ? "text-foreground/80" : "text-muted-foreground"}>
                    <span className={`mr-1 font-bold ${f.score > 0 ? "text-[hsl(var(--spring))]" : "text-destructive"}`}>
                      {f.score > 0 ? "↑" : "↓"}
                    </span>
                    {f.description}
                  </span>
                  <span className={`font-medium shrink-0 ml-2 ${f.score > 0 ? "text-[hsl(var(--spring))]" : "text-destructive"}`}>
                    {f.score > 0 ? "+" : ""}{f.score}
                  </span>
                </div>
              ))}
            </div>

            {/* 短期 / 中期 / 量 — 一行紧凑显示 */}
            <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground pt-0.5 border-t border-border/50">
              <span>短期</span>
              <span className={`font-semibold ${SEASON_COLOR[classification.stage] ?? ""}`}>
                {SEASON_LABEL[classification.stage] ?? "—"}
              </span>
              <span className="text-border">·</span>
              <span>中期</span>
              {mt && mt.stage !== "unknown"
                ? <span className={`font-semibold ${SEASON_COLOR[mt.stage] ?? ""}`}>{SEASON_LABEL[mt.stage]}</span>
                : <span>—</span>
              }
              {mt?.monthlyAlignment && (
                <span className="px-1 rounded text-[9px] bg-[hsl(var(--spring))]/15 text-[hsl(var(--spring))] font-medium">共振</span>
              )}
              {vs !== "unknown" && (
                <>
                  <span className="text-border">·</span>
                  <span>量</span>
                  <span className={`font-semibold ${SEASON_COLOR[vs] ?? ""}`}>{SEASON_LABEL[vs]}</span>
                  {volSync    && <span className="text-[hsl(var(--spring))]">同步</span>}
                  {volDiverge && <span className="text-destructive font-medium">⚠背离</span>}
                </>
              )}
            </div>

          </div>
        );
      })()}
    </div>
  );
};

function TodayCandle({ quote }: { quote: RealtimeQuote }) {
  const { price, open, high, low, prevClose, changePercent } = quote;
  const isUp = price >= prevClose;

  // Range: span from min(low, prevClose) to max(high, prevClose)
  const rangeMin = Math.min(low, prevClose);
  const rangeMax = Math.max(high, prevClose);
  const range = rangeMax - rangeMin;
  if (range <= 0) return null;

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - rangeMin) / range) * 100));

  const prevPct  = pct(prevClose);
  const openPct  = pct(open);
  const curPct   = pct(price);
  const bodyLeft = Math.min(openPct, curPct);
  const bodyWidth = Math.abs(curPct - openPct);

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground/60 mb-1">
        <span>今低 ¥{low.toFixed(2)}</span>
        <span className={`text-[10px] font-medium ${isUp ? "text-[hsl(var(--spring))]" : "text-destructive"}`}>
          今日 {isUp ? "+" : ""}{changePercent.toFixed(2)}%
        </span>
        <span>今高 ¥{high.toFixed(2)}</span>
      </div>
      {/* 今日 K 线轨道 */}
      <div className="relative h-3">
        {/* 背景轨道 */}
        <div className="absolute inset-0 rounded-full bg-secondary overflow-hidden">
          {/* 实体（开盘→现价） */}
          <div
            className={`absolute h-full ${isUp ? "bg-[hsl(var(--spring))]/50" : "bg-destructive/40"}`}
            style={{ left: `${bodyLeft}%`, width: `${Math.max(bodyWidth, 1)}%` }}
          />
        </div>
        {/* 昨收线 */}
        <div
          className="absolute top-0 bottom-0 w-px bg-muted-foreground/50 z-10"
          style={{ left: `${prevPct}%` }}
        />
        {/* 现价圆点 */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background shadow-sm z-20 ${isUp ? "bg-[hsl(var(--spring))]" : "bg-destructive"}`}
          style={{ left: `calc(${curPct}% - 6px)` }}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] text-muted-foreground/50 mt-0.5">
        <span></span>
        <span style={{ marginLeft: `${prevPct}%`, transform: 'translateX(-50%)' }}>昨收</span>
        <span></span>
      </div>
    </div>
  );
}
