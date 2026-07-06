"use client";

import { useEffect } from "react";

/**
 * FR-027 (F-G1b) — registers the installable-shell service worker
 * (`public/sw.js`). Renders nothing; registration only, no UI.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    function register() {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
