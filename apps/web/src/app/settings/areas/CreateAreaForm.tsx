"use client";

import { FormEvent, useState } from "react";
import type { Area } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createArea } from "../../../lib/data/workflow";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { workflowAreaIdForPersistedArea } from "@/lib/workflowAreaMapping";
import { useWorkflow } from "@/lib/WorkflowContext";
import { AREA_COLOR_PRESETS } from "@/lib/areaAccent";
import { AreaAccentPicker } from "./AreaAccentPicker";

type CreateState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; areaName: string }
  | { status: "error"; message: string };

function createFeedback(createState: CreateState) {
  if (createState.status === "saving") {
    return {
      variant: "default" as const,
      title: "Creating area",
      description:
        "LifeOS is saving the new area before it appears in active pickers.",
      nextStep: "Keep this page open until the new area is ready to use.",
    };
  }

  if (createState.status === "saved") {
    return {
      variant: "success" as const,
      title: "Area created.",
      description: `${createState.areaName} is now available in active area pickers.`,
      nextStep: "Use it now, or keep creating the scopes you actually need.",
    };
  }

  if (createState.status === "error") {
    return {
      variant: "destructive" as const,
      title: "Area could not be created",
      description: createState.message,
      nextStep: "Fix the problem, then try creating the area again.",
    };
  }

  return null;
}

interface CreateAreaFormProps {
  /** `state.areas` when the load-state is ready, else `null` (mirrors page's pre-load fallback). */
  currentAreas: Area[] | null;
  replaceReadyAreas: (nextAreas: Area[]) => void;
}

export function CreateAreaForm({
  currentAreas,
  replaceReadyAreas,
}: CreateAreaFormProps) {
  const { setSelectedAreaId } = useWorkflow();
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaDescription, setNewAreaDescription] = useState("");
  const [newAreaColor, setNewAreaColor] = useState<string>(
    AREA_COLOR_PRESETS[0].value,
  );
  const [createState, setCreateState] = useState<CreateState>({
    status: "idle",
  });

  async function handleCreateArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateState({ status: "saving" });

    try {
      const result = await createArea(createSupabaseBrowserClient(), {
        name: newAreaName,
        description: newAreaDescription,
        color: newAreaColor,
      });

      const nextAreas = currentAreas
        ? [...currentAreas, result.area]
        : [result.area];
      replaceReadyAreas(nextAreas);
      setSelectedAreaId(workflowAreaIdForPersistedArea(result.area));
      setNewAreaName("");
      setNewAreaDescription("");
      setNewAreaColor(AREA_COLOR_PRESETS[0].value);
      setCreateState({ status: "saved", areaName: result.area.name });
    } catch (error) {
      setCreateState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to create area.",
      });
    }
  }

  const createAreaFeedback = createFeedback(createState);

  return (
    <Card
      data-testid="areas-create-card"
      className="workflow-primary-card workflow-flagship-card"
    >
      <CardHeader>
        <p className="workflow-surface-kicker">Ownership starts here</p>
        <CardTitle className="workflow-surface-title text-3xl font-semibold leading-tight">
          Create area
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleCreateArea} className="space-y-4">
          <div className="workflow-action-tray">
            <p className="workflow-section-kicker">Opinionated default</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Keep names short and concrete. If you hesitate, it is probably too
              broad.
            </p>
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="area_name">Area name</Label>
            <Input
              id="area_name"
              value={newAreaName}
              onChange={(event) => {
                setNewAreaName(event.target.value);
                if (createState.status !== "idle") {
                  setCreateState({ status: "idle" });
                }
              }}
              placeholder="Main Job"
              disabled={createState.status === "saving"}
            />
          </div>
          <div className="grid gap-2 sm:max-w-xl">
            <Label htmlFor="area_description">Description</Label>
            <Textarea
              id="area_description"
              value={newAreaDescription}
              onChange={(event) => {
                setNewAreaDescription(event.target.value);
                if (createState.status !== "idle") {
                  setCreateState({ status: "idle" });
                }
              }}
              placeholder="What belongs in this area?"
              rows={3}
              disabled={createState.status === "saving"}
            />
          </div>
          <div className="grid gap-2">
            <Label>Starting accent</Label>
            <AreaAccentPicker
              selectedColor={newAreaColor}
              disabled={createState.status === "saving"}
              onSelect={(color) => {
                setNewAreaColor(color);
                if (createState.status !== "idle") {
                  setCreateState({ status: "idle" });
                }
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={createState.status === "saving"}>
              {createState.status === "saving" ? "Creating..." : "Create area"}
            </Button>
            <p className="text-sm text-muted-foreground">
              New work should have a clear area before planning or review.
            </p>
          </div>
        </form>

        {createAreaFeedback ? (
          <Alert
            variant={createAreaFeedback.variant}
            role={
              createAreaFeedback.variant === "destructive" ? "alert" : "status"
            }
            aria-live={
              createAreaFeedback.variant === "destructive"
                ? undefined
                : "polite"
            }
            className={
              createAreaFeedback.variant === "success"
                ? "workflow-celebration-alert text-foreground"
                : undefined
            }
          >
            <AlertTitle
              className={
                createAreaFeedback.variant === "success"
                  ? "text-primary"
                  : undefined
              }
            >
              {createAreaFeedback.title}
            </AlertTitle>
            <AlertDescription>
              {createAreaFeedback.description}
            </AlertDescription>
            <p className="text-sm font-medium">{createAreaFeedback.nextStep}</p>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
