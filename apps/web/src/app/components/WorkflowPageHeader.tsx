import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkflowPageHeaderProps {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  spotlight?: ReactNode;
  title?: ReactNode;
}

export function WorkflowPageHeader({
  actions,
  children,
  className,
  description,
  eyebrow,
  spotlight,
  title,
}: WorkflowPageHeaderProps) {
  const hasLeadContent = Boolean(eyebrow || title || description || actions);

  return (
    <section className={cn("workflow-page-header", className)}>
      {hasLeadContent || spotlight ? (
        <div
          className={cn(
            "grid gap-5",
            spotlight && hasLeadContent
              ? "xl:grid-cols-[minmax(0,1.05fr)_minmax(19rem,0.95fr)] xl:items-start"
              : undefined,
          )}
        >
          {hasLeadContent ? (
            <div className="workflow-page-copy">
              {eyebrow ? (
                <p className="workflow-page-eyebrow">{eyebrow}</p>
              ) : null}
              {title ? <h1 className="workflow-page-title">{title}</h1> : null}
              {description ? (
                <div className="workflow-page-description">{description}</div>
              ) : null}
              {actions ? (
                <div className="workflow-page-actions">{actions}</div>
              ) : null}
            </div>
          ) : null}
          {spotlight ? (
            <div className="workflow-page-spotlight">{spotlight}</div>
          ) : null}
        </div>
      ) : null}
      {children ? <div className="workflow-page-body">{children}</div> : null}
    </section>
  );
}
