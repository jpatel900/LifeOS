import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Card className="workflow-quiet-card border-dashed shadow-none">
      <CardContent className="p-5">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <CardDescription className="mt-1.5">{description}</CardDescription>
        ) : null}
      </CardContent>
    </Card>
  );
}
