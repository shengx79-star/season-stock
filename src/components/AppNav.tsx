import { useLocation, Link } from "react-router-dom";

export function AppNav() {
  const location = useLocation();
  const isPortfolio = location.pathname === "/portfolio";

  return (
    <nav className="flex gap-1 text-sm">
      <Link
        to="/?view=list"
        className={`px-3 py-1.5 rounded-md transition-colors ${
          !isPortfolio
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        四季分析
      </Link>
      <Link
        to="/portfolio"
        className={`px-3 py-1.5 rounded-md transition-colors ${
          isPortfolio
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        仓位管理
      </Link>
    </nav>
  );
}
