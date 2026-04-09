import { useState, useRef } from "react";
import { Search, X } from "lucide-react";
import { GoogleLogo } from "@/components/GoogleLogo";
import { SeasonOverview } from "@/components/SeasonOverview";
import { StockCard } from "@/components/StockCard";
import { StockAnalysis } from "@/components/StockAnalysis";
import { Stock, searchStocks, Season, seasonLabels, seasonEmojis } from "@/lib/stockData";

const seasonFilters: (Season | "all")[] = ["all", "spring", "summer", "autumn", "winter"];

const Index = () => {
  const [query, setQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [activeFilter, setActiveFilter] = useState<Season | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = searchStocks(query);
  const filteredResults = activeFilter === "all" ? results : results.filter((s) => s.season === activeFilter);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    setSelectedStock(null);
  };

  const handleStockClick = (stock: Stock) => {
    setSelectedStock(stock);
  };

  const handleBack = () => {
    setSelectedStock(null);
  };

  const handleClear = () => {
    setQuery("");
    setHasSearched(false);
    setSelectedStock(null);
    setActiveFilter("all");
    inputRef.current?.focus();
  };

  // Analysis view
  if (selectedStock) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border px-6 py-3">
          <div className="flex items-center gap-4 max-w-5xl mx-auto">
            <button onClick={handleBack} className="text-2xl font-bold tracking-tight shrink-0">
              <span className="text-spring">股</span>
              <span className="text-destructive">票</span>
              <span className="text-autumn">四</span>
              <span className="text-primary">季</span>
            </button>
            <form onSubmit={handleSearch} className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="search-input pl-11 pr-10 py-2.5 text-sm"
                  placeholder="搜索股票代码、名称或行业..."
                />
                {query && (
                  <button type="button" onClick={handleClear} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </header>
        <main className="px-6 py-8">
          <StockAnalysis stock={selectedStock} onBack={handleBack} />
        </main>
      </div>
    );
  }

  // Search results view
  if (hasSearched) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border px-6 py-3">
          <div className="flex items-center gap-4 max-w-5xl mx-auto">
            <button onClick={handleClear} className="text-2xl font-bold tracking-tight shrink-0">
              <span className="text-spring">股</span>
              <span className="text-destructive">票</span>
              <span className="text-autumn">四</span>
              <span className="text-primary">季</span>
            </button>
            <form onSubmit={handleSearch} className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setHasSearched(true); }}
                  className="search-input pl-11 pr-10 py-2.5 text-sm"
                  placeholder="搜索股票代码、名称或行业..."
                />
                {query && (
                  <button type="button" onClick={handleClear} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </header>

        {/* Season filter tabs */}
        <div className="border-b border-border px-6">
          <div className="max-w-5xl mx-auto flex gap-1 -mb-px">
            {seasonFilters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeFilter === filter
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {filter === "all" ? "全部" : `${seasonEmojis[filter]} ${seasonLabels[filter]}`}
              </button>
            ))}
          </div>
        </div>

        <main className="px-6 py-6">
          <div className="max-w-5xl mx-auto">
            <p className="text-sm text-muted-foreground mb-6">
              找到 {filteredResults.length} 只股票
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredResults.map((stock) => (
                <StockCard key={stock.symbol} stock={stock} onClick={handleStockClick} />
              ))}
            </div>
            {filteredResults.length === 0 && (
              <div className="text-center py-16">
                <p className="text-muted-foreground">没有找到匹配的股票</p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Home / Google-style landing
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-20">
        <GoogleLogo />

        <form onSubmit={handleSearch} className="w-full max-w-xl">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input pl-14 pr-12"
              placeholder="搜索股票代码、名称或行业..."
              autoFocus
            />
            {query && (
              <button type="button" onClick={handleClear} className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex justify-center gap-3 mt-6">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:shadow-sm hover:border-border border border-transparent transition-all"
            >
              搜索分析
            </button>
            <button
              type="button"
              onClick={() => { setQuery(""); setHasSearched(true); }}
              className="px-6 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:shadow-sm hover:border-border border border-transparent transition-all"
            >
              查看全部
            </button>
          </div>
        </form>

        <SeasonOverview />
      </div>

      <footer className="border-t border-border py-4 px-6">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-xs text-muted-foreground">
          <p>股票四季分析引擎</p>
          <p>数据仅供参考，不构成投资建议</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
