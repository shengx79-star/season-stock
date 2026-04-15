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
        className={`px-3 py-1.5 rounded-md transition-colors text-sm ${
          active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="flex items-center justify-between w-full">
      <div className="flex gap-1">
        {link("/?view=list", "四季分析")}
        {link("/portfolio", "仓位管理")}
        {link("/review", "复盘")}
      </div>
      <UserMenu />
    </nav>
  );
}
