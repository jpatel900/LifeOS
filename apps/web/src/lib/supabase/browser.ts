"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let browserClient: SupabaseClient | null | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient !== undefined) {
    return browserClient;
  }

  const config = getSupabaseConfig();

  if (!config) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient(config.url, config.anonKey);
  return browserClient;
}
