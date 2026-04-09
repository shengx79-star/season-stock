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
  inPortfolio: boolean;
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
  // 夏 (Summer) — 8 只
  { symbol: "002140", name: "东华科技", price: 12.49, change: -0.16, changePercent: -1.3, season: "summer", volume: "8.3M", marketCap: "52亿", pe: 25.1, sector: "化工" },
  { symbol: "600309", name: "万华化学", price: 87.59, change: 1.12, changePercent: 1.3, season: "summer", volume: "18.9M", marketCap: "2750亿", pe: 15.6, sector: "化工" },
  { symbol: "00981", name: "中芯国际", price: 56.10, change: -0.06, changePercent: -0.1, season: "summer", volume: "5.8M", marketCap: "4420亿", pe: 120.5, sector: "半导体" },
  { symbol: "01801", name: "信达生物", price: 88.00, change: -1.34, changePercent: -1.5, season: "summer", volume: "3.2M", marketCap: "1320亿", pe: -45.2, sector: "生物医药" },
  { symbol: "601985", name: "中国核电", price: 8.70, change: -0.08, changePercent: -0.9, season: "summer", volume: "42.5M", marketCap: "1630亿", pe: 18.5, sector: "电力" },
  { symbol: "000338", name: "潍柴动力", price: 25.98, change: 0.58, changePercent: 2.3, season: "summer", volume: "25.3M", marketCap: "2230亿", pe: 14.8, sector: "机械" },
  { symbol: "600938", name: "中国海油", price: 38.31, change: 0.93, changePercent: 2.5, season: "summer", volume: "45.6M", marketCap: "18200亿", pe: 8.5, sector: "石油" },
  { symbol: "00700", name: "腾讯控股", price: 511.50, change: 3.55, changePercent: 0.7, season: "summer", volume: "8.2M", marketCap: "48900亿", pe: 22.8, sector: "互联网" },
  { symbol: "00992", name: "联想集团", price: 9.91, change: -0.21, changePercent: -2.1, season: "summer", volume: "18.5M", marketCap: "1190亿", pe: 15.2, sector: "科技" },

  // 春 (Spring) — 5 只
  { symbol: "603899", name: "晨光股份", price: 25.73, change: -0.10, changePercent: -0.4, season: "spring", volume: "12.5M", marketCap: "238亿", pe: 18.2, sector: "文具" },
  { symbol: "000599", name: "青岛双星", price: 5.37, change: -0.15, changePercent: -2.7, season: "spring", volume: "15.6M", marketCap: "68亿", pe: -8.5, sector: "轮胎" },
  { symbol: "600089", name: "特变电工", price: 26.73, change: -0.19, changePercent: -0.7, season: "spring", volume: "22.4M", marketCap: "998亿", pe: 10.3, sector: "电力设备" },
  { symbol: "002408", name: "齐翔腾达", price: 6.90, change: 0.32, changePercent: 4.9, season: "spring", volume: "35.2M", marketCap: "92亿", pe: 28.6, sector: "化工" },
  { symbol: "600900", name: "长江电力", price: 26.39, change: -0.19, changePercent: -0.7, season: "spring", volume: "15.8M", marketCap: "6080亿", pe: 20.5, sector: "电力" },

  // 秋 (Autumn) — 3 只
  { symbol: "601899", name: "紫金矿业", price: 33.90, change: -0.73, changePercent: -2.1, season: "autumn", volume: "85.2M", marketCap: "890亿", pe: 12.8, sector: "矿业" },
  { symbol: "002714", name: "牧原股份", price: 43.80, change: -0.53, changePercent: -1.2, season: "autumn", volume: "28.7M", marketCap: "2280亿", pe: -15.8, sector: "养殖" },
  { symbol: "03690", name: "美团-W", price: 88.95, change: 0.44, changePercent: 0.5, season: "autumn", volume: "12.8M", marketCap: "5520亿", pe: -32.1, sector: "互联网" },

  // 冬 (Winter) — 4 只
  { symbol: "601919", name: "中远海控", price: 15.20, change: 0.00, changePercent: 0.0, season: "winter", volume: "32.1M", marketCap: "1520亿", pe: 5.2, sector: "航运" },
  { symbol: "600691", name: "阳化科技", price: 3.34, change: 0.04, changePercent: 1.2, season: "winter", volume: "6.2M", marketCap: "18亿", pe: -12.3, sector: "科技" },
  { symbol: "02331", name: "李宁", price: 22.64, change: 0.78, changePercent: 3.6, season: "winter", volume: "9.8M", marketCap: "580亿", pe: 22.3, sector: "运动服饰" },
  { symbol: "01919", name: "中远海控", price: 15.28, change: 0.00, changePercent: 0.0, season: "winter", volume: "6.1M", marketCap: "1520亿", pe: 5.2, sector: "航运" },
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
