import { Card, CardContent } from "@/components/ui/card";

interface WorkflowLoadingStateProps {
  title: string;
  description: string;
}

export function WorkflowLoadingState({
  title,
  description,
}: WorkflowLoadingStateProps) {
  return (
    <Card role="status" className="workflow-quiet-card border-dashed shadow-none">
      <CardContent className="flex items-start gap-4 p-5">
        <div aria-hidden className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="h-2.5 w-28 animate-pulse rounded-full bg-muted" />
          <span className="h-2.5 w-40 animate-pulse rounded-full bg-muted/80" />
        </div>
        <div className="min-w-0 flex-[1.5] space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
