const WORKFLOW_AREA_BY_SLUG: Record<string, string> = {
  "main-job": "area-main-job",
  personal: "area-personal",
  "volunteer-work": "area-volunteer",
  "side-project": "area-side-project",
};

const WORKFLOW_AREA_SLUG_BY_ID: Record<string, string> = {
  "area-main-job": "main-job",
  "area-personal": "personal",
  "area-volunteer": "volunteer-work",
  "area-side-project": "side-project",
};

export function workflowAreaIdForSlug(slug: string): string | null {
  return WORKFLOW_AREA_BY_SLUG[slug] ?? null;
}

export function slugForWorkflowAreaId(workflowAreaId: string): string | null {
  return WORKFLOW_AREA_SLUG_BY_ID[workflowAreaId] ?? null;
}
