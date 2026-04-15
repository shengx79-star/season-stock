import { useLocation, Link } from "react-router-dom";
import { UserMenu } from "@/components/UserMenu";

export function AppNav() {
  const location = useLocation();
  const path = location.pathname;

  const link = (to: string, label: string) => {
    const active = path === to || (to === "/" && !path.startsWith("/portfolio") && !path.startsWith("/review"));
    return (
      <Link
        to={to}
        className={`px-2 sm:px-3 py-1.5 rounded-md transition-colors text-xs sm:text-sm whitespace-nowrap ${
          active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex items-center justify-between w-full min-w-0">
      <div className="flex gap-0.5 sm:gap-1 shrink-0">
        {link("/?view=list", "四季分析")}
        {link("/portfolio", "仓位管理")}
        {link("/review", "复盘")}
      </div>
      <UserMenu />
    </nav>
  );
}
