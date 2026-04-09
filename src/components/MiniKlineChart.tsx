import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  ResponsiveContainer,
  YAxis,
  XAxis,
  Cell,
} from "recharts";
import { Candle } from "@/lib/stockClassifier";
import { Season } from "@/lib/stockData";

interface MiniKlineChartProps {
  dailyBars: Candle[];
  season: Season;
  bars?: number;
  height?: number;
  className?: string;
}

interface CandleData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  isUp: boolean;
  // For the bar: [bottom, top] of the body
  body: [number, number];
}

const UP_COLOR = "hsl(var(--spring))";
const DOWN_COLOR = "hsl(var(--destructive))";

// Custom candlestick shape
const CandlestickShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;

  const { high, low, open, close, isUp } = payload;
  const color = isUp ? UP_COLOR : DOWN_COLOR;

  // Calculate positions based on the Y axis scale
  const yScale = props.yScale || props.background?.y;

  // We use the bar's position info to derive scale
  const bodyTop = y;
  const bodyBottom = y + height;
  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);

  // Pixel per price unit
  if (bodyHigh === bodyLow || height === 0) {
    // Doji - just draw a line
    const centerX = x + width / 2;
    return (
      <g>
        <line x1={centerX} y1={bodyTop - 4} x2={centerX} y2={bodyBottom + 4} stroke={color} strokeWidth={1} />
        <line x1={x + 1} y1={bodyTop} x2={x + width - 1} y2={bodyTop} stroke={color} strokeWidth={1} />
      </g>
    );
  }

  const pxPerUnit = Math.abs(height) / (bodyHigh - bodyLow);
  const wickTop = bodyTop - (high - bodyHigh) * pxPerUnit;
  const wickBottom = bodyBottom + (bodyLow - low) * pxPerUnit;
  const centerX = x + width / 2;
  const barWidth = Math.max(1, width - 2);

  return (
    <g>
      {/* Upper wick */}
      <line x1={centerX} y1={wickTop} x2={centerX} y2={bodyTop} stroke={color} strokeWidth={1} />
      {/* Lower wick */}
      <line x1={centerX} y1={bodyBottom} x2={centerX} y2={wickBottom} stroke={color} strokeWidth={1} />
      {/* Body */}
      <rect
        x={x + (width - barWidth) / 2}
        y={bodyTop}
        width={barWidth}
        height={Math.max(1, Math.abs(height))}
        fill={isUp ? "transparent" : color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

export const MiniKlineChart = ({
  dailyBars,
  season,
  bars = 30,
  height = 60,
  className = "",
}: MiniKlineChartProps) => {
  const { data, domain } = useMemo(() => {
    const recent = dailyBars.slice(-bars);
    const d: CandleData[] = recent.map((c) => {
      const isUp = c.close >= c.open;
      return {
        date: c.date,
        open: c.open,
        close: c.close,
        high: c.high,
        low: c.low,
        isUp,
        body: isUp ? [c.open, c.close] : [c.close, c.open],
      };
    });
    const allLows = d.map((c) => c.low);
    const allHighs = d.map((c) => c.high);
    const min = Math.min(...allLows) * 0.998;
    const max = Math.max(...allHighs) * 1.002;
    return { data: d, domain: [min, max] as [number, number] };
  }, [dailyBars, bars]);

  if (data.length < 2) return null;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }} barGap={0} barCategoryGap="20%">
          <YAxis domain={domain} hide />
          <XAxis dataKey="date" hide />
          <Bar dataKey="body" shape={<CandlestickShape />} isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell key={index} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Larger candlestick chart for the detail page */
export const KlineChart = ({
  dailyBars,
  season,
  bars = 90,
  height = 200,
  className = "",
}: MiniKlineChartProps) => {
  const { data, domain } = useMemo(() => {
    const recent = dailyBars.slice(-bars);
    const d: CandleData[] = recent.map((c) => {
      const isUp = c.close >= c.open;
      return {
        date: c.date,
        open: c.open,
        close: c.close,
        high: c.high,
        low: c.low,
        isUp,
        body: isUp ? [c.open, c.close] : [c.close, c.open],
      };
    });
    const allLows = d.map((c) => c.low);
    const allHighs = d.map((c) => c.high);
    const min = Math.min(...allLows) * 0.995;
    const max = Math.max(...allHighs) * 1.005;
    return { data: d, domain: [min, max] as [number, number] };
  }, [dailyBars, bars]);

  if (data.length < 2) return null;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={0} barCategoryGap="15%">
          <YAxis domain={domain} hide />
          <XAxis dataKey="date" hide />
          <Bar dataKey="body" shape={<CandlestickShape />} isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell key={index} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
