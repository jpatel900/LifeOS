/** Order whole-row account writes within one provider lifetime. Local edits do
 * not wait. A rejected write must release the next user's attempted write. */
export function createOrderedWrites() {
  const pending = new Map<string, Promise<unknown>>();
  return function run<T>(key: string, write: () => Promise<T>): Promise<T> {
    const invoke = async () => write();
    const previous = pending.get(key);
    const next = previous
      ? previous.catch(() => undefined).then(invoke)
      : invoke();
    pending.set(key, next);
    return next.finally(() => {
      if (pending.get(key) === next) pending.delete(key);
    });
  };
}
