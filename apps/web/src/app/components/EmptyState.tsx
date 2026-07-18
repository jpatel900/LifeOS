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
        {/* #660 audit line X2: title was a muted `text-base`/90%-opacity
            treatment, quieter than the ratified moments empty-state
            orientation grammar (#623/#647), which reads an empty state's
            "what" at full card-title strength rather than fading it. The
            title+description+action shape here already matches the
            orientation pattern's what/one-next-step content (see this
            component's single consumer, AreaRegistryCards.tsx); only the
            title's type strength needed to move. `.empty-state-title`
            (globals.css) carries the same fixed 1.5rem/620 numbers as the
            moments card-title tier, as a dedicated class rather than
            reusing `.moments-card-title` itself: that class is explicitly
            scoped to the moments feature (its own comment says "WITHIN
            moments only"), and this primitive is used outside moments
            (currently AreaRegistryCards.tsx under settings/areas), so
            coupling it to a feature-owned class would be the same mistake
            login's title deliberately avoided. Upgrading the shared
            primitive once so every consumer inherits it; the blast radius
            today is that one card grid, not a wider set of surfaces. */}
        <CardTitle className="empty-state-title text-foreground">
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
