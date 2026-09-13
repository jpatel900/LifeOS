import { snapshotProtectedFiles } from "./protectTrackedFiles.mjs";

export default async function globalSetup() {
  snapshotProtectedFiles();
}
