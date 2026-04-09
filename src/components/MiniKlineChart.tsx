import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  ResponsiveContainer,
  YAxis,
  XAxis,
  Cell,
  Tooltip,
} from "recharts";
import { Candle } from "@/lib/stockClassifier";
import { Season } from "@/lib/stockData";

interface MiniKlineChartProps {
  dailyBars: Candle[];
  season: Season;
  bars?: number;
  height?: number;
  className?: string;
  showVolume?: boolean;
}

interface CandleData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  isUp: boolean;
  body: [number, number];
}

const UP_COLOR = "#22c55e";
const DOWN_COLOR = "#ef4444";
const UP_COLOR_LIGHT = "rgba(34,197,94,0.35)";
const DOWN_COLOR_LIGHT = "rgba(239,68,68,0.35)";

// Custom candlestick shape
const CandlestickShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;

  const { high, low, open, close, isUp } = payload;
  const color = isUp ? UP_COLOR : DOWN_COLOR;

  const bodyTop = y;
  const bodyBottom = y + height;
  const bodyHigh = Math.max(open, close);
  const bodyLow = Math.min(open, close);

  if (bodyHigh === bodyLow || height === 0) {
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
      <line x1={centerX} y1={wickTop} x2={centerX} y2={bodyTop} stroke={color} strokeWidth={1} />
      <line x1={centerX} y1={bodyBottom} x2={centerX} y2={wickBottom} stroke={color} strokeWidth={1} />
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

function prepareData(dailyBars: Candle[], bars: number, padding: number) {
  const recent = dailyBars.slice(-bars);
  const d: CandleData[] = recent.map((c) => {
    const isUp = c.close >= c.open;
    return {
      date: c.date,
      open: c.open,
      close: c.close,
      high: c.high,
      low: c.low,
      volume: c.volume,
      isUp,
      body: isUp ? [c.open, c.close] : [c.close, c.open],
    };
  });
  const allLows = d.map((c) => c.low);
  const allHighs = d.map((c) => c.high);
  const min = Math.min(...allLows) * (1 - padding);
  const max = Math.max(...allHighs) * (1 + padding);
  const maxVol = Math.max(...d.map((c) => c.volume));
  return { data: d, domain: [min, max] as [number, number], maxVol };
}

// Volume bar shape
const VolumeBarShape = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  const color = payload.isUp ? UP_COLOR_LIGHT : DOWN_COLOR_LIGHT;
  return (
    <rect x={x} y={y} width={width} height={Math.abs(height)} fill={color} rx={0.5} />
  );
};

export const MiniKlineChart = ({
  dailyBars,
  season,
  bars = 30,
  height = 60,
  className = "",
}: MiniKlineChartProps) => {
  const { data, domain } = useMemo(() => prepareData(dailyBars, bars, 0.002), [dailyBars, bars]);

  if (data.length < 2) return null;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }} barGap={0} barCategoryGap="20%">
          <YAxis domain={domain} hide />
          <XAxis dataKey="date" hide />
          <Bar dataKey="body" shape={<CandlestickShape />} isAnimationActive={false}>
            {data.map((_, i) => <Cell key={i} />)}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Detail page: candlestick + volume */
export const KlineChart = ({
  dailyBars,
  season,
  bars = 90,
  height = 280,
  className = "",
}: MiniKlineChartProps) => {
  const { data, domain, maxVol } = useMemo(() => prepareData(dailyBars, bars, 0.005), [dailyBars, bars]);

  if (data.length < 2) return null;

  const candleHeight = Math.round(height * 0.72);
  const volumeHeight = Math.round(height * 0.28);

  return (
    <div className={className}>
      {/* Candlestick chart */}
      <div style={{ height: candleHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={0} barCategoryGap="15%">
            <YAxis domain={domain} hide />
            <XAxis dataKey="date" hide />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload as CandleData;
                return (
                  <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
                    <p className="text-muted-foreground mb-1">{d.date}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <span className="text-muted-foreground">开</span><span className="text-foreground font-mono">{d.open.toFixed(2)}</span>
                      <span className="text-muted-foreground">收</span><span className={`font-mono ${d.isUp ? "text-green-500" : "text-red-500"}`}>{d.close.toFixed(2)}</span>
                      <span className="text-muted-foreground">高</span><span className="text-foreground font-mono">{d.high.toFixed(2)}</span>
                      <span className="text-muted-foreground">低</span><span className="text-foreground font-mono">{d.low.toFixed(2)}</span>
                      <span className="text-muted-foreground">量</span><span className="text-foreground font-mono">{(d.volume / 10000).toFixed(0)}万</span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="body" shape={<CandlestickShape />} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} />)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume chart */}
      <div style={{ height: volumeHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 0, right: 4, bottom: 0, left: 4 }} barGap={0} barCategoryGap="15%">
            <YAxis domain={[0, maxVol * 1.1]} hide />
            <XAxis dataKey="date" hide />
            <Bar dataKey="volume" shape={<VolumeBarShape />} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} />)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
