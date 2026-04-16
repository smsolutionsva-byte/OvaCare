import { Link, useLocation } from "react-router-dom";
import { Heart, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user, signOutUser, isConfigured } = useAuth();

  const links = [
    { to: "/", label: "Home" },
    { to: "/predict", label: "Risk Predictor" },
    { to: "/analyze", label: "Report Analyzer" },
    { to: "/tracker", label: "Report Tracker" },
    { to: "/copilot", label: "Care Copilot" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-heading text-xl font-bold text-foreground">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
            <Heart className="h-5 w-5 text-primary-foreground" />
          </div>
          OvaCare
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                location.pathname === l.to
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <span className="max-w-36 truncate text-xs text-muted-foreground">
                {user.email}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void signOutUser()}>
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" className="gradient-primary border-0" asChild>
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>

        <button
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-border bg-background p-4 md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2">
            {user ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMobileOpen(false);
                  void signOutUser();
                }}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>Log in</Link>
                </Button>
                <Button size="sm" className="gradient-primary border-0" asChild>
                  <Link to="/signup" onClick={() => setMobileOpen(false)}>Sign up</Link>
                </Button>
              </>
            )}
            {!isConfigured && (
              <p className="px-1 text-xs text-destructive">
                Configure Firebase env vars to enable auth.
              </p>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
