import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DiagnosticsDisclosureProps
  extends Omit<ComponentPropsWithoutRef<"details">, "children" | "title"> {
  children: ReactNode;
  className?: string;
  detailLevel?: "system" | "developer";
  title?: string;
  summaryClassName?: string;
  contentClassName?: string;
}

export function DiagnosticsDisclosure({
  children,
  className,
  detailLevel = "system",
  title,
  summaryClassName,
  contentClassName,
  ...props
}: DiagnosticsDisclosureProps) {
  const resolvedTitle =
    title ?? (detailLevel === "developer" ? "Developer details" : "System details");

  return (
    <details
      className={cn("system-details-disclosure", className)}
      data-detail-level={detailLevel}
      {...props}
    >
      <summary
        className={cn(
          "cursor-pointer select-none text-sm font-medium text-foreground transition-colors",
          summaryClassName,
        )}
      >
        {resolvedTitle}
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
