import { ClassificationResult, PureStage, StageScores } from "@/lib/stockClassifier";
import { seasonLabels, seasonEmojis, Season } from "@/lib/stockData";

interface ScoreBreakdownPanelProps {
  result: ClassificationResult;
}

const STAGES: PureStage[] = ["winter", "spring", "summer", "autumn"];

function ScoreRow({ label, scores, cap }: { label: string; scores: StageScores; cap: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-muted-foreground font-medium shrink-0">{label}</span>
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
  );
}

export const ScoreBreakdownPanel = ({ result }: ScoreBreakdownPanelProps) => {
  const { scores, scoreBreakdown, turnSignals, confidence, confidenceLevel, seasonScore } = result;

  return (
    <div className="space-y-4">
      {/* 季节总分 */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">各季节总分</h4>
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
          <div className="grid grid-cols-4 gap-1 text-center mb-1">
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
        <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">转折信号</h4>
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
        <div>
          <span className="text-muted-foreground">置信度: </span>
          <span className={`font-bold ${
            confidenceLevel === "high" ? "text-[hsl(var(--spring))]" :
            confidenceLevel === "medium" ? "text-[hsl(var(--autumn))]" : "text-destructive"
          }`}>
            {(confidence * 100).toFixed(0)}% ({confidenceLevel})
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">季节温度: </span>
          <span className="font-bold text-foreground">{seasonScore}</span>
        </div>
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
