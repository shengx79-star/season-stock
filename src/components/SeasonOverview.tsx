import { Season, seasonLabels, seasonDescriptions, seasonEmojis, getStocksBySeason } from "@/lib/stockData";

const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

export const SeasonOverview = () => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mt-10 animate-fade-in">
      {seasons.map((season) => {
        const stocks = getStocksBySeason(season);
        return (
          <div key={season} className={`rounded-2xl p-4 bg-${season}-light border border-border`}>
            <div className="text-3xl mb-2">{seasonEmojis[season]}</div>
            <h3 className={`text-lg font-medium text-${season}-foreground`}>
              {seasonLabels[season]}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{seasonDescriptions[season]}</p>
            <p className={`text-2xl font-bold mt-3 text-${season}-foreground`}>{stocks.length}</p>
            <p className="text-xs text-muted-foreground">只股票</p>
          </div>
        );
      })}
    </div>
  );
};
