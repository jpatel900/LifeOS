"use client";

import { LifeOSCockpit } from "./LifeOSCockpit";
import type { CockpitStage } from "@/lib/cockpit/viewModel";

export function CockpitRoute({ stage }: { stage: CockpitStage }) {
  return <LifeOSCockpit initialStage={stage} />;
}
