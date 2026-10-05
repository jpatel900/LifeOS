// Leave the route time to turn a provider timeout into its existing safe error.
export const PARSE_CAPTURE_PROVIDER_DEADLINE_MS = 30_000;
export const TASK_MAP_DRAFT_PROVIDER_DEADLINE_MS = 50_000;
export const ROLLUP_PROSE_PROVIDER_DEADLINE_MS = 50_000;
export const PARSE_CAPTURE_CLIENT_DEADLINE_MS = 35_000;

/** Bounds the whole request, including body reading, and cancels its transport. */
export async function withRequestDeadline<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("AI request deadline exceeded.");
      // Reject first so transport abort listeners cannot replace the deadline.
      reject(error);
      controller.abort();
    }, timeoutMs);
  });

  try {
    // The race also bounds injected transports that ignore the abort signal.
    // Both outcomes remain observed after the deadline; late data is discarded.
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
