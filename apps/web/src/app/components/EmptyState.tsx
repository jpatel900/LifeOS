import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Card className="workflow-quiet-card border-dashed bg-muted/20 shadow-none">
      <CardContent className="p-5 sm:p-6">
        <CardTitle className="text-base tracking-tight text-foreground/90">
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="mt-1.5 max-w-2xl text-sm leading-6">
            {description}
          </CardDescription>
        ) : null}
        {action ? (
          <div className="mt-4 flex flex-wrap gap-2">{action}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
