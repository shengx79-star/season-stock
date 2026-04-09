import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Candle } from "@/lib/stockClassifier";
import { Season } from "@/lib/stockData";

interface MiniKlineChartProps {
  dailyBars: Candle[];
  season: Season;
  /** Number of recent bars to display */
  bars?: number;
  height?: number;
  className?: string;
}

const SEASON_COLORS: Record<Season, { stroke: string; fill: string }> = {
  spring: { stroke: "hsl(var(--spring))", fill: "hsl(var(--spring) / 0.15)" },
  summer: { stroke: "hsl(var(--summer, 142 71% 45%))", fill: "hsl(var(--summer, 142 71% 45%) / 0.15)" },
  autumn: { stroke: "hsl(var(--autumn))", fill: "hsl(var(--autumn) / 0.15)" },
  winter: { stroke: "hsl(var(--primary))", fill: "hsl(var(--primary) / 0.1)" },
};

export const MiniKlineChart = ({
  dailyBars,
  season,
  bars = 30,
  height = 60,
  className = "",
}: MiniKlineChartProps) => {
  const data = useMemo(() => {
    const recent = dailyBars.slice(-bars);
    return recent.map((c) => ({
      date: c.date,
      close: c.close,
    }));
  }, [dailyBars, bars]);

  if (data.length < 2) return null;

  const colors = SEASON_COLORS[season];

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`gradient-${season}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={colors.stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Area
            type="monotone"
            dataKey="close"
            stroke={colors.stroke}
            strokeWidth={1.5}
            fill={`url(#gradient-${season})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Larger chart for the detail page with more data points */
export const KlineChart = ({
  dailyBars,
  season,
  bars = 90,
  height = 200,
  className = "",
}: MiniKlineChartProps) => {
  const { data, min, max } = useMemo(() => {
    const recent = dailyBars.slice(-bars);
    const closes = recent.map((c) => c.close);
    return {
      data: recent.map((c) => ({ date: c.date, close: c.close })),
      min: Math.min(...closes) * 0.998,
      max: Math.max(...closes) * 1.002,
    };
  }, [dailyBars, bars]);

  if (data.length < 2) return null;

  const colors = SEASON_COLORS[season];
  const isUp = data[data.length - 1].close >= data[0].close;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`gradient-detail-${season}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isUp ? "hsl(var(--spring))" : "hsl(var(--destructive))"} stopOpacity={0.25} />
              <stop offset="100%" stopColor={isUp ? "hsl(var(--spring))" : "hsl(var(--destructive))"} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis domain={[min, max]} hide />
          <Area
            type="monotone"
            dataKey="close"
            stroke={isUp ? "hsl(var(--spring))" : "hsl(var(--destructive))"}
            strokeWidth={2}
            fill={`url(#gradient-detail-${season})`}
            dot={false}
            isAnimationActive={true}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
