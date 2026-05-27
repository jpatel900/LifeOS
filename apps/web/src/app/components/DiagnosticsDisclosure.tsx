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
  title = "Diagnostics",
}: DiagnosticsDisclosureProps) {
  return (
    <details className={cn("text-sm text-muted-foreground", className)}>
      <summary className="cursor-pointer select-none">{title}</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}
