"use client";

import { MoonStar, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme !== "light" : true;

  return (
    <div className="flex items-center gap-2">
      <Button
        aria-label="Toggle theme"
        variant="ghost"
        size="icon"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        type="button"
        disabled={!mounted}
      >
        {isDark ? <Sun /> : <MoonStar />}
      </Button>
      {!mounted ? (
        <span className="text-xs text-muted-foreground">
          Theme toggle is loading.
        </span>
      ) : null}
    </div>
  );
}
