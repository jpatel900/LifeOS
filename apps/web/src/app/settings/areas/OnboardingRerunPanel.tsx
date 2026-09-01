"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requestOnboardingRerun } from "@/lib/onboarding/onboarding";

/**
 * #581 — the "run setup again" affordance from the onboarding design note.
 * Writes the device-local rerun request (an active account has areas and
 * captures, so the zero-state trigger alone could never re-admit the
 * ritual) and lands on the ritual's own route.
 *
 * C3 (onboarding own-URL): used to `push("/")` and rely on Today detecting
 * the rerun request and handing off. That extra hop is unnecessary here —
 * unlike a fresh sign-in, this click is the moment eligibility becomes true
 * (`requestOnboardingRerun()` just above it is exactly what
 * `shouldShowOnboarding` checks first), so navigating straight to
 * `/welcome` is both correct and one fewer client-side redirect.
 */
export function OnboardingRerunPanel() {
  const router = useRouter();

  return (
    <Card data-testid="onboarding-rerun-card" className="workflow-admin-card">
      <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
        <p>
          Walk through the three setup steps again — areas, day shape, and a
          first capture. Nothing is deleted: existing areas show up as the
          starting point.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            requestOnboardingRerun();
            router.push("/welcome");
          }}
          data-testid="onboarding-rerun-button"
        >
          Run setup again
        </Button>
      </CardContent>
    </Card>
  );
}
