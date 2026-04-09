export type Season = "spring" | "summer" | "autumn" | "winter";

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  season: Season;
  volume: string;
  marketCap: string;
  pe: number;
  sector: string;
}

export const seasonLabels: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

export const seasonDescriptions: Record<Season, string> = {
  spring: "复苏期 — 底部反转，趋势向上",
  summer: "繁荣期 — 强势上涨，动能充沛",
  autumn: "衰退期 — 高位震荡，动能减弱",
  winter: "萧条期 — 持续下跌，底部探索",
};

export const seasonEmojis: Record<Season, string> = {
  spring: "🌱",
  summer: "☀️",
  autumn: "🍂",
  winter: "❄️",
};

export const stockPool: Stock[] = [
  { symbol: "AAPL", name: "苹果公司", price: 178.72, change: 2.35, changePercent: 1.33, season: "summer", volume: "58.2M", marketCap: "2.78T", pe: 28.5, sector: "科技" },
  { symbol: "MSFT", name: "微软", price: 378.91, change: 4.12, changePercent: 1.10, season: "summer", volume: "22.1M", marketCap: "2.81T", pe: 35.2, sector: "科技" },
  { symbol: "GOOGL", name: "谷歌", price: 141.80, change: -0.95, changePercent: -0.67, season: "autumn", volume: "25.8M", marketCap: "1.78T", pe: 24.1, sector: "科技" },
  { symbol: "AMZN", name: "亚马逊", price: 178.25, change: 3.40, changePercent: 1.94, season: "spring", volume: "45.3M", marketCap: "1.85T", pe: 62.3, sector: "消费" },
  { symbol: "TSLA", name: "特斯拉", price: 248.42, change: -5.18, changePercent: -2.04, season: "autumn", volume: "112.5M", marketCap: "790B", pe: 72.1, sector: "汽车" },
  { symbol: "NVDA", name: "英伟达", price: 875.35, change: 18.72, changePercent: 2.19, season: "summer", volume: "42.7M", marketCap: "2.16T", pe: 65.8, sector: "半导体" },
  { symbol: "META", name: "Meta", price: 505.95, change: 8.32, changePercent: 1.67, season: "summer", volume: "15.8M", marketCap: "1.29T", pe: 33.4, sector: "科技" },
  { symbol: "BABA", name: "阿里巴巴", price: 72.43, change: -1.28, changePercent: -1.74, season: "winter", volume: "18.2M", marketCap: "184B", pe: 9.8, sector: "电商" },
  { symbol: "JD", name: "京东", price: 27.85, change: 0.42, changePercent: 1.53, season: "spring", volume: "12.4M", marketCap: "43B", pe: 12.5, sector: "电商" },
  { symbol: "PDD", name: "拼多多", price: 125.60, change: -3.42, changePercent: -2.65, season: "autumn", volume: "8.9M", marketCap: "172B", pe: 18.2, sector: "电商" },
  { symbol: "NIO", name: "蔚来汽车", price: 5.82, change: -0.15, changePercent: -2.51, season: "winter", volume: "32.1M", marketCap: "11.2B", pe: -15.3, sector: "汽车" },
  { symbol: "AMD", name: "AMD", price: 172.33, change: 5.67, changePercent: 3.40, season: "spring", volume: "55.2M", marketCap: "278B", pe: 48.2, sector: "半导体" },
  { symbol: "INTC", name: "英特尔", price: 31.05, change: -0.88, changePercent: -2.76, season: "winter", volume: "38.9M", marketCap: "131B", pe: -8.2, sector: "半导体" },
  { symbol: "DIS", name: "迪士尼", price: 112.78, change: 1.25, changePercent: 1.12, season: "spring", volume: "9.8M", marketCap: "206B", pe: 42.1, sector: "娱乐" },
  { symbol: "BA", name: "波音", price: 198.42, change: -4.56, changePercent: -2.25, season: "winter", volume: "7.2M", marketCap: "119B", pe: -22.5, sector: "航空" },
  { symbol: "JPM", name: "摩根大通", price: 198.55, change: 2.10, changePercent: 1.07, season: "summer", volume: "8.5M", marketCap: "572B", pe: 11.8, sector: "金融" },
];

export function searchStocks(query: string): Stock[] {
  if (!query.trim()) return stockPool;
  const q = query.toLowerCase();
  return stockPool.filter(
    (s) =>
      s.symbol.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.sector.toLowerCase().includes(q) ||
      seasonLabels[s.season].includes(q)
  );
}

export function getStocksBySeason(season: Season): Stock[] {
  return stockPool.filter((s) => s.season === season);
}
