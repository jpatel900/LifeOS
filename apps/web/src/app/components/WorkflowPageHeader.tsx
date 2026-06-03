import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkflowPageHeaderProps {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  spotlight?: ReactNode;
  title?: ReactNode;
}

export function WorkflowPageHeader({
  children,
  className,
  description,
  spotlight,
  title,
}: WorkflowPageHeaderProps) {
  return (
    <section className={cn("workflow-page-header", className)}>
      {spotlight ? (
        <div className="workflow-page-spotlight">{spotlight}</div>
      ) : null}
      {title || description || children ? (
        <div className="grid gap-4">
          {title || description ? (
            <header className="grid gap-1">
              {title ? (
                <div className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {title}
                </div>
              ) : null}
              {description ? (
                <div className="text-sm text-muted-foreground">
                  {description}
                </div>
              ) : null}
            </header>
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
