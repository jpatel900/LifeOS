import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DiagnosticsDisclosureProps extends Omit<
  ComponentPropsWithoutRef<"details">,
  "children" | "title"
> {
  children: ReactNode;
  className?: string;
  detailLevel?: "system" | "developer";
  title?: string;
  summaryClassName?: string;
  contentClassName?: string;
  /** #660 audit line S8: `"card"` (default) is each disclosure standing
   * alone with its own border/background/padding (`.system-details-
   * disclosure`) — right for a single disclosure dropped into a page.
   * `"flat"` drops that per-item card surface so a group of disclosures
   * can share ONE outer moments-card-grammar container (see
   * settings/areas/page.tsx's six-disclosure group) instead of stacking
   * N bordered boxes back to back. */
  variant?: "card" | "flat";
}

export function DiagnosticsDisclosure({
  children,
  className,
  detailLevel = "system",
  title,
  summaryClassName,
  contentClassName,
  variant = "card",
  ...props
}: DiagnosticsDisclosureProps) {
  const resolvedTitle =
    title ??
    (detailLevel === "developer" ? "Developer details" : "System details");

  return (
    <details
      className={cn(
        variant === "card" ? "system-details-disclosure" : "px-4 py-3",
        className,
      )}
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
