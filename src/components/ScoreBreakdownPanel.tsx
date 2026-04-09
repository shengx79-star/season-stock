import { ClassificationResult, PureStage, StageScores } from "@/lib/stockClassifier";
import { seasonLabels, seasonEmojis, Season } from "@/lib/stockData";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface ScoreBreakdownPanelProps {
  result: ClassificationResult;
}

const STAGES: PureStage[] = ["winter", "spring", "summer", "autumn"];

const CATEGORY_EXPLANATIONS: Record<string, { title: string; desc: string; details: string[] }> = {
  TREND: {
    title: "趋势评分",
    desc: "基于均线排列和MACD方向判断当前趋势强度",
    details: [
      "均线多头排列(MA5>MA14>MA20) → summer +2",
      "均线空头排列(MA5<MA14<MA20) → winter +2",
      "部分多头(MA5>MA14或MA14>MA20) → summer +1",
      "部分空头(MA5<MA14或MA14<MA20) → winter +1",
      "MACD柱为正 → summer +1",
      "MACD柱为负 → winter +1",
    ],
  },
  TURN: {
    title: "转折评分",
    desc: "检测金叉/死叉等转折信号，判断趋势拐点",
    details: [
      "MA5/14金叉 → spring +2",
      "MA5/14死叉 → autumn +2",
      "MA5/20金叉 → spring +2",
      "MA5/20死叉 → autumn +2",
      "MACD金叉 → spring +1",
      "MACD死叉 → autumn +1",
      "RSI<30 → spring/winter +1",
      "KDJ J<20 → spring +1, J>80 → autumn +1",
    ],
  },
  EXT: {
    title: "扩展评分",
    desc: "通过布林带、BIAS和日内涨跌幅捕捉极端状态",
    details: [
      "%B > 0.5 → summer +1",
      "%B ≤ 0.5 → winter +1",
      "BIAS60 > 15 → autumn +2（过热警告）",
      "日涨幅 ≥ 3% → summer +1",
      "日涨幅 ≥ 1% → summer +1",
      "日跌幅 ≤ -3% → winter +1",
      "日跌幅 ≤ -1% → winter +1",
    ],
  },
  WEEKLY: {
    title: "周线评分",
    desc: "周线级别趋势确认，过滤日线噪音",
    details: [
      "周线MA5>MA14 → summer +1",
      "周线MA5<MA14 → winter +1",
      "周线MACD柱由负转正 → spring +2",
      "周线MACD柱由正转负 → autumn +2",
    ],
  },
};

function CategoryLabel({ category }: { category: string }) {
  const info = CATEGORY_EXPLANATIONS[category];
  if (!info) return <span className="w-16 text-muted-foreground font-medium shrink-0">{category}</span>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-16 text-muted-foreground font-medium shrink-0 cursor-help flex items-center gap-0.5">
            {category}
            <Info className="w-3 h-3 text-muted-foreground/50" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs p-3">
          <p className="font-medium text-foreground text-sm mb-1">{info.title}</p>
          <p className="text-muted-foreground text-xs mb-2">{info.desc}</p>
          <ul className="space-y-0.5">
            {info.details.map((d, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {d}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const CATEGORY_PREFIX_MAP: Record<string, string> = {
  TREND: "趋势:",
  TURN: "转折:",
  EXT: "扩展:",
  WEEKLY: "周线:",
};

function ScoreRow({ label, scores, cap, notes }: { label: string; scores: StageScores; cap: number; notes: string[] }) {
  const prefix = CATEGORY_PREFIX_MAP[label] || "";
  const relevantNotes = notes.filter(n => n.startsWith(prefix));

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-xs">
        <CategoryLabel category={label} />
        <div className="flex-1 grid grid-cols-4 gap-1">
          {STAGES.map((s) => (
            <div key={s} className="text-center">
              <div className={`rounded px-1.5 py-0.5 font-mono ${scores[s] > 0 ? `bg-${s}-light text-${s}-foreground` : "text-muted-foreground/50"}`}>
                {scores[s]}/{cap}
              </div>
            </div>
          ))}
        </div>
      </div>
      {relevantNotes.length > 0 && (
        <div className="ml-[72px] space-y-0">
          {relevantNotes.map((note, i) => (
            <div key={i} className="text-[10px] text-muted-foreground/70 leading-tight">
              • {note.replace(prefix + " ", "")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const ScoreBreakdownPanel = ({ result }: ScoreBreakdownPanelProps) => {
  const { scores, scoreBreakdown, turnSignals, confidence, confidenceLevel, seasonScore, notes } = result;

  return (
    <div className="space-y-4">
      {/* 季节总分 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">各季节总分</h4>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-3">
                <p className="text-xs text-muted-foreground">
                  四个季节分别累加 TREND、TURN、EXT、WEEKLY 四组评分，得分最高的季节即为当前判定阶段。将鼠标悬停在各分组名称上查看详细规则。
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {STAGES.map((s) => {
            const isTop = result.stage === s;
            return (
              <div
                key={s}
                className={`rounded-lg p-2 text-center border ${isTop ? `border-${s as Season === "winter" ? "primary" : s}-500/50 bg-${s}-light` : "border-border"}`}
              >
                <div className="text-lg">{seasonEmojis[s]}</div>
                <div className={`text-xl font-bold ${isTop ? `text-${s}-foreground` : "text-foreground"}`}>
                  {scores[s]}
                </div>
                <div className="text-xs text-muted-foreground">{seasonLabels[s]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 分组明细 */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">评分明细</h4>
        <div className="space-y-1.5">
          <div className="grid grid-cols-4 gap-1 text-center mb-1 ml-[72px]">
            {STAGES.map((s) => (
              <span key={s} className="text-xs text-muted-foreground">{seasonEmojis[s]}</span>
            ))}
          </div>
          <ScoreRow label="TREND" scores={scoreBreakdown.trend} cap={6} />
          <ScoreRow label="TURN" scores={scoreBreakdown.turn} cap={6} />
          <ScoreRow label="EXT" scores={scoreBreakdown.extension} cap={3} />
          <ScoreRow label="WEEKLY" scores={scoreBreakdown.weekly} cap={3} />
        </div>
      </div>

      {/* 转折信号 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">转折信号</h4>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-3">
                <p className="text-xs text-muted-foreground">
                  上行转折信号(金叉/站上MA20等)累计≥2个时，提示可能进入春季；下行转折信号(死叉/跌破MA20等)累计≥2个时，提示可能进入秋季。
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">上行转折:</span>
            <span className={`font-bold ${turnSignals.upTurnCount >= 2 ? "text-[hsl(var(--spring))]" : "text-muted-foreground"}`}>
              {turnSignals.upTurnCount}/3
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">下行转折:</span>
            <span className={`font-bold ${turnSignals.downTurnCount >= 2 ? "text-[hsl(var(--autumn))]" : "text-muted-foreground"}`}>
              {turnSignals.downTurnCount}/3
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {turnSignals.ma514Golden && <SignalTag label="MA5/14金叉" type="up" />}
          {turnSignals.ma514Dead && <SignalTag label="MA5/14死叉" type="down" />}
          {turnSignals.ma520Golden && <SignalTag label="MA5/20金叉" type="up" />}
          {turnSignals.ma520Dead && <SignalTag label="MA5/20死叉" type="down" />}
          {turnSignals.macdGolden && <SignalTag label="MACD金叉" type="up" />}
          {turnSignals.macdDead && <SignalTag label="MACD死叉" type="down" />}
          {turnSignals.priceReclaimMA20 && <SignalTag label="站上MA20" type="up" />}
          {turnSignals.priceLoseMA20 && <SignalTag label="跌破MA20" type="down" />}
        </div>
      </div>

      {/* 置信度 + 季节温度 */}
      <div className="flex gap-4 text-xs">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <span className="text-muted-foreground">置信度: </span>
                <span className={`font-bold ${
                  confidenceLevel === "high" ? "text-[hsl(var(--spring))]" :
                  confidenceLevel === "medium" ? "text-[hsl(var(--autumn))]" : "text-destructive"
                }`}>
                  {(confidence * 100).toFixed(0)}% ({confidenceLevel})
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs p-3">
              <p className="text-xs text-muted-foreground">
                置信度 = (最高分 - 次高分) / 总分。差距越大说明判定越明确。≥50% 为高，25-50% 为中，&lt;25% 为低。
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <span className="text-muted-foreground">季节温度: </span>
                <span className="font-bold text-foreground">{seasonScore}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs p-3">
              <p className="text-xs text-muted-foreground">
                0-100 的温度值：冬=0-25，春=25-50，夏=50-75，秋=75-100。数值越高表示市场越"热"。
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

function SignalTag({ label, type }: { label: string; type: "up" | "down" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      type === "up"
        ? "bg-[hsl(var(--spring-light))] text-[hsl(var(--spring-foreground))]"
        : "bg-[hsl(var(--autumn-light))] text-[hsl(var(--autumn-foreground))]"
    }`}>
      {type === "up" ? "↑" : "↓"} {label}
    </span>
  );
}
