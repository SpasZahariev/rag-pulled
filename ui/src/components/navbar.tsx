import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { Menu } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { ModeToggle } from "@/components/mode-toggle";

interface NavbarProps {
  onSignInClick?: () => void;
}

export function Navbar({ onSignInClick }: NavbarProps = {}) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();  // Set isLoggedOut flag first
    signOut(auth);  // Then sign out from Firebase
  };

  const isAnonymous = user?.isAnonymous ?? false;

  return (
    <header className="sticky top-0 z-50 flex items-center h-12 px-4 border-b-3 border-foreground shrink-0 bg-background">
      <div className="flex items-center">
        <SidebarTrigger className="size-8">
          <Menu className="w-5 h-5" />
        </SidebarTrigger>
        <span className="font-black text-lg uppercase tracking-wide ml-3">RagPull</span>
      </div>
      <div className="flex items-center gap-3 ml-auto">
        {user && !isAnonymous && (
          <span className="text-sm">
            Welcome, {user.displayName || user.email}
          </span>
        )}
        <ModeToggle />
        {user && (
          isAnonymous ? (
            <Button
              variant="outline"
              size="sm"
              className="mb-[4px]"
              onClick={onSignInClick}
            >
              Sign In
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="mb-[4px]"
              onClick={handleLogout}
            >
              Sign Out
            </Button>
          )
        )}
      </div>
    </header>
  );
} 