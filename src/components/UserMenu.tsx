import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "用户";

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground truncate max-w-[120px]">{displayName}</span>
      <Button variant="ghost" size="icon" onClick={handleSignOut} title="退出登录">
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}
