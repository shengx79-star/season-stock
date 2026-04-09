import { Stock, Season, seasonLabels, seasonDescriptions, seasonEmojis } from "@/lib/stockData";
import { useStockClassifications } from "@/hooks/useStockClassification";

const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

interface SeasonOverviewProps {
  stocks: Stock[];
}

export const SeasonOverview = ({ stocks }: SeasonOverviewProps) => {
  const { results: classifications, loading } = useStockClassifications(stocks);

  const countBySeason = (season: Season) => {
    let count = 0;
    for (const stock of stocks) {
      const cls = classifications.get(stock.symbol);
      const stage = cls && cls.stage !== "unknown" ? cls.stage : stock.season;
      if (stage === season) count++;
    }
    return count;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mt-10 animate-fade-in">
      {seasons.map((season) => {
        const count = countBySeason(season);
        return (
          <div key={season} className={`rounded-2xl p-4 bg-${season}-light border border-border`}>
            <div className="text-3xl mb-2">{seasonEmojis[season]}</div>
            <h3 className={`text-lg font-medium text-${season}-foreground`}>
              {seasonLabels[season]}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{seasonDescriptions[season]}</p>
            <p className={`text-2xl font-bold mt-3 text-${season}-foreground`}>
              {loading ? "…" : count}
            </p>
            <p className="text-xs text-muted-foreground">只股票</p>
          </div>
        );
      })}
    </div>
  );
};
