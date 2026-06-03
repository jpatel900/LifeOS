import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DiagnosticsDisclosureProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function DiagnosticsDisclosure({
  children,
  className,
  title = "System details",
}: DiagnosticsDisclosureProps) {
  return (
    <details className={cn("system-details-disclosure", className)}>
      <summary className="cursor-pointer select-none text-sm font-medium text-foreground transition-colors">
        {title}
      </summary>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">
        {children}
      </div>
    </details>
  );
}
