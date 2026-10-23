import { listPendingWrites } from "./pendingWriteJournal";

/**
 * Copy the journal as it exists when asked. This is only a local recovery copy
 * of pending changes, not an account export or a complete device backup. Reading
 * and downloading never replay, remove, reset, or otherwise change the originals.
 */
export async function downloadPendingWriteRecoveryCopy(): Promise<
  "download-started" | "empty"
> {
  // The journal's SSR fallback returns [] when IndexedDB is absent. A recovery
  // action must distinguish inaccessible storage from a genuinely empty read.
  if (typeof indexedDB === "undefined") {
    throw new Error("Device storage is unavailable for a recovery copy.");
  }
  const pendingWrites = await listPendingWrites();
  if (pendingWrites.length === 0) return "empty";

  const exportedAt = new Date().toISOString();
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: "lifeos-pending-writes",
          version: 1,
          exported_at: exportedAt,
          pending_writes: pendingWrites,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  try {
    link.href = url;
    link.download = `lifeos-saved-changes-${exportedAt.replace(/[:.]/g, "-")}.json`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
  return "download-started";
}
