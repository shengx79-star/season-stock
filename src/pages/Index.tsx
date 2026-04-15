import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { matchesPinyin } from "@/lib/pinyinMatch";
import { Search, X, Plus, Loader2 } from "lucide-react";
import { GoogleLogo } from "@/components/GoogleLogo";
import { AppNav } from "@/components/AppNav";
import { SeasonOverview } from "@/components/SeasonOverview";
import { StockCard } from "@/components/StockCard";
import { StockAnalysis } from "@/components/StockAnalysis";
import { Stock, Season, seasonLabels, seasonEmojis } from "@/lib/stockData";
import { useStockClassifications, useStockClassification } from "@/hooks/useStockClassification";
import { useStockPool } from "@/hooks/useStockPool";
import { lookupStock, searchStockByName, StockSuggestion } from "@/lib/stockLookup";
import { detectMarketFromTag, getMarketColorClass } from "@/lib/marketDetect";
import { toast } from "sonner";

const seasonFilters: (Season | "all")[] = ["all", "spring", "summer", "autumn", "winter"];

const Index = () => {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(() => {
    if (searchParams.get("view") === "list") return true;
    const visited = localStorage.getItem("stock4s_visited");
    if (visited) return true;
    localStorage.setItem("stock4s_visited", "1");
    return false;
  });
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [activeFilter, setActiveFilter] = useState<Season | "all">("all");
  const [lookingUp, setLookingUp] = useState(false);
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { stocks: stockPool, addStock, removeStock, togglePortfolio, refreshing, refreshPrices } = useStockPool();

  const handleDeleteStock = async (symbol: string) => {
    const ok = await removeStock(symbol);
    if (ok) toast.success(`已从股票池移除 ${symbol}`);
    else toast.error("删除失败");
  };

  const handleTogglePortfolio = async (symbol: string, value: boolean) => {
    const ok = await togglePortfolio(symbol, value);
    if (ok) toast.success(value ? "已纳入仓位管理" : "已移出仓位管理");
    else toast.error("操作失败");
  };

  // Search within the pool using committed query (only updates on Enter)
  const searchResults = (() => {
    if (!committedQuery.trim()) return stockPool;
    const q = committedQuery.toLowerCase();
    return stockPool.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q) ||
        matchesPinyin(s.name, q)
    );
  })();

  const { results: classifications, dailyBarsMap } = useStockClassifications(searchResults);

  const filteredResults = activeFilter === "all"
    ? searchResults
    : searchResults.filter((s) => {
        const cls = classifications.get(s.symbol);
        const stage = cls && cls.stage !== "unknown" ? cls.stage : s.season;
        return stage === activeFilter;
      });

  // Check if query looks like a stock code (digits only)
  const isStockCode = /^\d{5,6}$/.test(query.trim());
  const codeNotInPool = isStockCode && !stockPool.some((s) => s.symbol === query.trim());
  const isCommittedTextQuery = committedQuery.trim().length >= 2 && !/^\d{5,6}$/.test(committedQuery.trim());

  // Auto-search remote when local results empty and committed query is text
  useEffect(() => {
    if (!isCommittedTextQuery || filteredResults.length > 0) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingRemote(true);
      try {
        const results = await searchStockByName(committedQuery.trim());
        setSuggestions(results);
      } catch { setSuggestions([]); }
      finally { setSearchingRemote(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [committedQuery, isCommittedTextQuery, filteredResults.length]);

  const handleAddSuggestion = async (s: StockSuggestion) => {
    setAddingSymbol(s.symbol);
    try {
      const stock = await lookupStock(s.symbol);
      if (!stock) { toast.error(`未找到 ${s.name}`); return; }
      const ok = await addStock(stock);
      if (ok) {
        toast.success(`已添加 ${stock.name}(${stock.symbol})`);
        setQuery("");
        setHasSearched(true);
      }
    } catch { toast.error("添加失败"); }
    finally { setAddingSymbol(null); }
  };

  const handleLookupAndAdd = async () => {
    const symbol = query.trim();
    setLookingUp(true);
    try {
      const stock = await lookupStock(symbol);
      if (!stock) {
        toast.error(`未找到股票 ${symbol}`);
        return;
      }
      const ok = await addStock(stock);
      if (ok) {
        toast.success(`已添加 ${stock.name}(${stock.symbol}) 到股票池`);
        setSelectedStock(stock);
        setHasSearched(false);
      }
    } catch {
      toast.error("查找股票失败，请重试");
    } finally {
      setLookingUp(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeNotInPool) {
      handleLookupAndAdd();
    } else {
      setCommittedQuery(query);
      setHasSearched(true);
      setSelectedStock(null);
    }
  };

  const handleStockClick = (stock: Stock) => setSelectedStock(stock);
  const handleBack = () => setSelectedStock(null);

  const handleClear = () => {
    setQuery("");
    setCommittedQuery("");
    setHasSearched(false);
    setSelectedStock(null);
    setActiveFilter("all");
    inputRef.current?.focus();
  };

  const renderSearchHeader = (onLogoClick: () => void) => (
    <header className="border-b border-border px-3 sm:px-6 py-3">
      <div className="flex items-center gap-2 sm:gap-4 max-w-5xl mx-auto">
        <button onClick={onLogoClick} className="text-xl sm:text-2xl font-bold tracking-tight shrink-0">
          <span className="text-[hsl(var(--spring))]">股</span>
          <span className="text-destructive">票</span>
          <span className="text-[hsl(var(--autumn))]">四</span>
          <span className="text-primary">季</span>
        </button>
        <AppNav />
      </div>
      <div className="max-w-5xl mx-auto mt-2 sm:mt-0 sm:hidden">
        <form onSubmit={handleSearch}>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input pl-11 pr-10 py-2 text-sm"
              placeholder="股票代码或名称..."
            />
            {query && (
              <button type="button" onClick={handleClear} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
            A股代码 · 港股5位代码 · 美股英文代码 · 日股4位代码 · 韩股需搜索名称
          </p>
        </form>
      </div>
      <div className="hidden sm:block max-w-5xl mx-auto mt-0">
        <div className="flex justify-end">
          <form onSubmit={handleSearch} className="w-full max-w-md">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="search-input pl-11 pr-10 py-2.5 text-sm"
                placeholder="输入股票代码添加，或搜索名称..."
              />
              {query && (
                <button type="button" onClick={handleClear} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </header>
  );

  // Analysis view
  if (selectedStock) {
    return (
      <div className="min-h-screen bg-background">
        {renderSearchHeader(handleBack)}
        <main className="px-6 py-8">
          <SelectedStockAnalysis stock={selectedStock} onBack={handleBack} />
        </main>
      </div>
    );
  }

  // Search results view
  if (hasSearched) {
    return (
      <div className="min-h-screen bg-background">
        {renderSearchHeader(handleClear)}
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
                <StockCard
                  key={stock.symbol}
                  stock={stock}
                  classification={classifications.get(stock.symbol)}
                  dailyBars={dailyBarsMap.get(stock.symbol)}
                  onClick={handleStockClick}
                  onDelete={handleDeleteStock}
                  onTogglePortfolio={handleTogglePortfolio}
                />
              ))}
            </div>
            {filteredResults.length === 0 && codeNotInPool && (
              <div className="text-center py-16">
                <p className="text-muted-foreground mb-4">股票池中没有 {query}</p>
                <button
                  onClick={handleLookupAndAdd}
                  disabled={lookingUp}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  搜索并添加 {query}
                </button>
              </div>
            )}
            {filteredResults.length === 0 && !codeNotInPool && (
              <div className="text-center py-12">
                {searchingRemote ? (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在搜索外部数据源...</span>
                  </div>
                ) : suggestions.length > 0 ? (
                  <div>
                    <p className="text-muted-foreground mb-4">股票池中未找到，以下是外部搜索结果：</p>
                    <div className="max-w-md mx-auto space-y-2">
                      {suggestions.map((s) => {
                        const mLabel = detectMarketFromTag(s.market);
                        const mColor = getMarketColorClass(mLabel);
                        return (
                          <button
                            key={s.symbol}
                            onClick={() => handleAddSuggestion(s)}
                            disabled={addingSymbol === s.symbol}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
                          >
                            <div className="text-left flex items-center gap-2">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${mColor}`}>{mLabel}</span>
                              <span className="text-sm font-medium text-foreground">{s.name}</span>
                              <span className="text-xs text-muted-foreground">{s.symbol}</span>
                            </div>
                            {addingSymbol === s.symbol ? (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Plus className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">没有找到匹配的股票</p>
                )}
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
              placeholder="代码或名称：600519 / AAPL / samsung..."
              autoFocus
            />
            {query && (
              <button type="button" onClick={handleClear} className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-3 text-xs text-muted-foreground">
            <span><span className="text-red-400">沪</span> 600xxx</span>
            <span><span className="text-blue-400">深</span> 000/300xxx</span>
            <span><span className="text-orange-400">港</span> 0xxxx</span>
            <span><span className="text-emerald-400">美</span> AAPL</span>
            <span><span className="text-purple-400">日</span> 7203</span>
            <span><span className="text-cyan-400">韩</span> 搜名称</span>
          </div>
          <div className="flex justify-center gap-3 mt-4">
            {codeNotInPool ? (
              <button
                type="submit"
                disabled={lookingUp}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                搜索并添加 {query}
              </button>
            ) : query.trim() ? (
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all"
              >
                <Search className="w-4 h-4" />
                搜索
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setQuery(""); setCommittedQuery(""); setHasSearched(true); }}
                className="px-6 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:shadow-sm hover:border-border border border-transparent transition-all"
              >
                查看全部
              </button>
            )}
          </div>
        </form>
        <SeasonOverview stocks={stockPool} />
      </div>
      <footer className="border-t border-border py-4 px-6">
        <div className="max-w-5xl mx-auto flex justify-between items-center text-xs text-muted-foreground">
          <p>股票四季分析引擎 V2</p>
          <p>数据仅供参考，不构成投资建议</p>
        </div>
      </footer>
    </div>
  );
};

/** Wrapper that runs classification for the selected stock */
function SelectedStockAnalysis({ stock, onBack }: { stock: Stock; onBack: () => void }) {
  const classification = useStockClassification(stock);
  return (
    <>
      {classification.loading && (
        <div className="max-w-2xl mx-auto mb-4 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm text-center animate-pulse">
          正在获取真实行情数据...
        </div>
      )}
      <StockAnalysis stock={stock} classification={classification} dailyBars={classification.dailyBars} onBack={onBack} />
    </>
  );
}

export default Index;
