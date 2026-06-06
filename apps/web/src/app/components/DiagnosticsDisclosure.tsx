import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DiagnosticsDisclosureProps
  extends Omit<ComponentPropsWithoutRef<"details">, "children" | "title"> {
  children: ReactNode;
  className?: string;
  title?: string;
  summaryClassName?: string;
  contentClassName?: string;
}

export function DiagnosticsDisclosure({
  children,
  className,
  title = "System details",
  summaryClassName,
  contentClassName,
  ...props
}: DiagnosticsDisclosureProps) {
  return (
    <details className={cn("system-details-disclosure", className)} {...props}>
      <summary
        className={cn(
          "cursor-pointer select-none text-sm font-medium text-foreground transition-colors",
          summaryClassName,
        )}
      >
        {title}
      </summary>
      <div
        className={cn(
          "mt-2 space-y-2 text-sm text-muted-foreground",
          contentClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
