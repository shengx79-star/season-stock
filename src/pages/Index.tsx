import { useState } from "react";
import { Sparkles, Plus } from "lucide-react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { StockAnalysis } from "@/components/StockAnalysis";
import { Stock, stockPool } from "@/lib/stockData";
import { useStockClassifications, useStockClassification } from "@/hooks/useStockClassification";

const Index = () => {
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const classifications = useStockClassifications(stockPool);

  const handleStockClick = (stock: Stock) => setSelectedStock(stock);
  const handleBack = () => setSelectedStock(null);

  if (selectedStock) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border px-6 py-3">
          <div className="flex items-center gap-4 max-w-full mx-auto">
            <button onClick={handleBack} className="text-2xl font-bold tracking-tight shrink-0">
              <span className="text-[hsl(var(--spring))]">股</span>
              <span className="text-destructive">票</span>
              <span className="text-[hsl(var(--autumn))]">四</span>
              <span className="text-primary">季</span>
            </button>
          </div>
        </header>
        <main className="px-6 py-8">
          <SelectedStockAnalysis stock={selectedStock} onBack={handleBack} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">股票池</h1>
          <p className="text-sm text-muted-foreground mt-1">生命周期管理 · 冬→春→夏→秋</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-secondary transition-colors">
            <Plus className="w-4 h-4" /> 添加
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity">
            <Sparkles className="w-4 h-4" /> AI 分类
          </button>
        </div>
      </header>

      {/* Kanban */}
      <main className="flex-1 px-6 pb-6 min-h-0">
        <KanbanBoard classifications={classifications} onStockClick={handleStockClick} />
      </main>
    </div>
  );
};

function SelectedStockAnalysis({ stock, onBack }: { stock: Stock; onBack: () => void }) {
  const classification = useStockClassification(stock);
  return <StockAnalysis stock={stock} classification={classification} onBack={onBack} />;
}

export default Index;
