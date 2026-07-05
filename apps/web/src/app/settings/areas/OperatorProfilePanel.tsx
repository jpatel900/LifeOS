"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready" }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/**
 * Minimal edit surface for the single global operator profile (issue #254).
 * The profile text feeds the NS-INV-1 context-assembly module. Compensation
 * rules are captured in later work; this panel edits the free-text profile.
 */
export function OperatorProfilePanel() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [profileText, setProfileText] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const client = createSupabaseBrowserClient();
      if (!client) {
        if (!cancelled) {
          setLoadState({ status: "unavailable" });
        }
        return;
      }

      try {
        const { data: sessionData } = await client.auth.getSession();
        const uid = sessionData.session?.user?.id ?? null;
        if (!uid) {
          if (!cancelled) {
            setLoadState({ status: "unavailable" });
          }
          return;
        }

        const { data, error } = await client
          .from("operator_profiles")
          .select("profile_text")
          .eq("user_id", uid)
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        if (!cancelled) {
          setUserId(uid);
          setProfileText(data?.profile_text ?? "");
          setLoadState({ status: "ready" });
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load your operator profile right now.",
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!userId) {
      return;
    }

    setSaveState({ status: "saving" });

    try {
      const client = createSupabaseBrowserClient();
      if (!client) {
        throw new Error("Sign in before editing your operator profile.");
      }

      const trimmed = profileText.trim();
      const { error } = await client.from("operator_profiles").upsert(
        {
          user_id: userId,
          profile_text: trimmed.length > 0 ? trimmed : null,
        },
        { onConflict: "user_id" },
      );

      if (error) {
        throw new Error(error.message);
      }

      setSaveState({ status: "saved" });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not save your operator profile. Try again.",
      });
    }
  }

  return (
    <Card data-testid="operator-profile-card" className="workflow-admin-card">
      <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
        <p>
          Describe your named strengths and weaknesses and how the assistant
          should compensate (for example: starting friction, so require a
          concrete first move). This personalizes AI parsing through the single
          context-assembly module.
        </p>

        {loadState.status === "loading" ? (
          <p role="status" aria-live="polite">
            Loading your operator profile...
          </p>
        ) : null}

        {loadState.status === "unavailable" ? (
          <Alert variant="warning" role="status">
            <AlertTitle>Sign in to edit your operator profile.</AlertTitle>
            <AlertDescription>
              The operator profile is stored on your account, not on this
              device.
            </AlertDescription>
          </Alert>
        ) : null}

        {loadState.status === "error" ? (
          <Alert variant="warning" role="status">
            <AlertTitle>Could not load your operator profile.</AlertTitle>
            <AlertDescription>{loadState.message}</AlertDescription>
          </Alert>
        ) : null}

        {loadState.status === "ready" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="operator-profile-text">Operator profile</Label>
              <Textarea
                id="operator-profile-text"
                value={profileText}
                onChange={(event) => {
                  setProfileText(event.target.value);
                  setSaveState({ status: "idle" });
                }}
                placeholder="Strengths, weaknesses, and how to compensate."
                rows={5}
              />
            </div>

            {saveState.status === "saved" ? (
              <Alert variant="success" role="status" aria-live="polite">
                <AlertTitle>Operator profile saved.</AlertTitle>
              </Alert>
            ) : null}

            {saveState.status === "error" ? (
              <Alert variant="warning" role="status" aria-live="polite">
                <AlertTitle>Could not save.</AlertTitle>
                <AlertDescription>{saveState.message}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleSave()}
              disabled={saveState.status === "saving"}
            >
              {saveState.status === "saving"
                ? "Saving..."
                : "Save operator profile"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
