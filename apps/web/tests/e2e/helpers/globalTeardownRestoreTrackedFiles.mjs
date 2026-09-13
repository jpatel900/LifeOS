import { restoreProtectedFiles } from "./protectTrackedFiles.mjs";

export default async function globalTeardown() {
  restoreProtectedFiles();
}
