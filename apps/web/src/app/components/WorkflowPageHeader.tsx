import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkflowPageHeaderProps {
  actions?: ReactNode;
  bodyClassName?: string;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  spotlightClassName?: string;
  spotlight?: ReactNode;
  title?: ReactNode;
}

export function WorkflowPageHeader({
  actions,
  bodyClassName,
  children,
  className,
  description,
  eyebrow,
  spotlightClassName,
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
            <div className={cn("workflow-page-spotlight", spotlightClassName)}>
              {spotlight}
            </div>
          ) : null}
        </div>
      ) : null}
      {children ? (
        <div className={cn("workflow-page-body", bodyClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
