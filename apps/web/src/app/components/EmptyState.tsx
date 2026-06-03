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
    <Card className="workflow-quiet-card border-dashed shadow-none">
      <CardContent className="p-5">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <CardDescription className="mt-1.5">{description}</CardDescription>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
