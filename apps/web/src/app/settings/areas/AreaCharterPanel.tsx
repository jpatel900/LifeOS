"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";

interface CharterArea {
  id: string;
  name: string;
  slug: string;
  charter_text: string | null;
}

type LoadState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; areas: CharterArea[] }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

/**
 * Minimal per-area charter editor (issue #254). A charter describes what an
 * area is for, its ideal state, season, and constraints; it feeds the NS-INV-1
 * context-assembly module. Empty charters leave AI prompts byte-identical to
 * baseline.
 */
export function AreaCharterPanel() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [charterText, setCharterText] = useState("");

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
        const { data, error } = await client
          .from("areas")
          .select("id,name,slug,charter_text")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (error) {
          throw new Error(error.message);
        }

        const areas = (data ?? []) as CharterArea[];
        if (!cancelled) {
          setLoadState({ status: "ready", areas });
          const first = areas[0];
          if (first) {
            setSelectedAreaId(first.id);
            setCharterText(first.charter_text ?? "");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load your areas right now.",
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const areas = useMemo(
    () => (loadState.status === "ready" ? loadState.areas : []),
    [loadState],
  );
  const selectedArea = useMemo(
    () => areas.find((area) => area.id === selectedAreaId) ?? null,
    [areas, selectedAreaId],
  );

  function handleSelectArea(areaId: string) {
    setSelectedAreaId(areaId);
    setSaveState({ status: "idle" });
    const next = areas.find((area) => area.id === areaId);
    setCharterText(next?.charter_text ?? "");
  }

  async function handleSave() {
    if (!selectedArea) {
      return;
    }

    setSaveState({ status: "saving" });

    try {
      const client = createSupabaseBrowserClient();
      if (!client) {
        throw new Error("Sign in before editing a charter.");
      }

      const trimmed = charterText.trim();
      const nextCharter = trimmed.length > 0 ? trimmed : null;
      const { error } = await client
        .from("areas")
        .update({
          charter_text: nextCharter,
          charter_updated_at: new Date().toISOString(),
        })
        .eq("id", selectedArea.id);

      if (error) {
        throw new Error(error.message);
      }

      setLoadState((current) =>
        current.status === "ready"
          ? {
              ...current,
              areas: current.areas.map((area) =>
                area.id === selectedArea.id
                  ? { ...area, charter_text: nextCharter }
                  : area,
              ),
            }
          : current,
      );
      setSaveState({ status: "saved" });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not save the charter. Try again.",
      });
    }
  }

  return (
    <Card data-testid="area-charter-card" className="workflow-admin-card">
      <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
        <p>
          A charter describes what an area is for, its ideal state, its current
          season, and its constraints. It personalizes AI parsing for that area
          through the single context-assembly module. Leaving it empty keeps
          prompts unchanged.
        </p>

        {loadState.status === "loading" ? (
          <p role="status" aria-live="polite">
            Loading your areas...
          </p>
        ) : null}

        {loadState.status === "unavailable" ? (
          <Alert variant="warning" role="status">
            <AlertTitle>Sign in to edit area charters.</AlertTitle>
            <AlertDescription>
              Charters are stored on your account, not on this device.
            </AlertDescription>
          </Alert>
        ) : null}

        {loadState.status === "error" ? (
          <Alert variant="warning" role="status">
            <AlertTitle>Could not load your areas.</AlertTitle>
            <AlertDescription>{loadState.message}</AlertDescription>
          </Alert>
        ) : null}

        {loadState.status === "ready" && areas.length === 0 ? (
          <p>Create an area first, then add its charter here.</p>
        ) : null}

        {loadState.status === "ready" && selectedArea ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="charter-area-select">Area</Label>
              <select
                id="charter-area-select"
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedAreaId}
                onChange={(event) => handleSelectArea(event.target.value)}
              >
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="charter-text">Charter</Label>
              <Textarea
                id="charter-text"
                value={charterText}
                onChange={(event) => {
                  setCharterText(event.target.value);
                  setSaveState({ status: "idle" });
                }}
                placeholder="What this area is for, its ideal state, season, and constraints."
                rows={5}
              />
            </div>

            {saveState.status === "saved" ? (
              <Alert variant="success" role="status" aria-live="polite">
                <AlertTitle>Charter saved.</AlertTitle>
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
              {saveState.status === "saving" ? "Saving..." : "Save charter"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
