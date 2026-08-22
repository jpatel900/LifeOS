"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { HIT_TARGET_MIN } from "./hitTarget";

/**
 * #688: the shell's auth door. The signed-out state used to degrade silently
 * to local mode with no visible way back in ("I have no idea where the
 * sign-in page is now"). This is the one calm affordance that closes that
 * gap — presentation + navigation only, no auth logic beyond reading the
 * current session and signing out.
 *
 * Three honest states:
 * - accounts not set up here (Supabase not configured): render nothing. A
 *   "Sign in" door would dead-end on a page that can't sign anyone in, so we
 *   don't show one — this device is simply local-only.
 * - configured + no session: a plain "Sign in" pill -> /login?next=<here>, so
 *   the person returns to the page they were on after signing in.
 * - configured + signed in: a quiet who + "Sign out", matching the masthead's
 *   pill grammar (never louder than Settings next to it).
 *
 * Copy follows #692: plain language, no vendor/technical words.
 */

type AuthPresence =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "signed-in"; label: string };

const PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 text-xs font-semibold text-muted-foreground outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0";

function shortLabel(email: string | null | undefined): string {
  if (!email) return "Signed in";
  const handle = email.split("@")[0] ?? email;
  return handle.length > 0 ? handle : "Signed in";
}

export function AuthAffordance() {
  const pathname = usePathname();
  const [presence, setPresence] = useState<AuthPresence>({ status: "loading" });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setPresence({ status: "unconfigured" });
      return;
    }
    const client = createSupabaseBrowserClient();
    if (!client?.auth) {
      setPresence({ status: "unconfigured" });
      return;
    }

    let active = true;
    void client.auth
      .getUser()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data.user) {
          setPresence({ status: "signed-out" });
          return;
        }
        setPresence({
          status: "signed-in",
          label: shortLabel(data.user.email),
        });
      })
      .catch(() => {
        if (active) setPresence({ status: "signed-out" });
      });

    // Keep the door in step if the session changes in another tab or after a
    // sign-out here — read-only subscription, no auth flow of its own.
    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        setPresence(
          session?.user
            ? { status: "signed-in", label: shortLabel(session.user.email) }
            : { status: "signed-out" },
        );
      },
    );

    return () => {
      active = false;
      subscription?.subscription?.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const client = createSupabaseBrowserClient();
    if (!client?.auth) return;
    await client.auth.signOut();
    setPresence({ status: "signed-out" });
  }

  if (presence.status === "loading" || presence.status === "unconfigured") {
    return null;
  }

  if (presence.status === "signed-out") {
    const nextParam = pathname && pathname !== "/login" ? pathname : "/";
    return (
      <Link
        href={`/login?next=${encodeURIComponent(nextParam)}`}
        className={cn(HIT_TARGET_MIN, PILL_CLASS)}
        data-testid="masthead-signin-link"
      >
        <LogIn className="size-4" aria-hidden="true" />
        Sign in
      </Link>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      data-testid="masthead-auth-signed-in"
    >
      <span
        className="hidden max-w-[10rem] truncate text-xs font-semibold text-muted-foreground sm:inline"
        title={presence.label}
      >
        {presence.label}
      </span>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        className={cn(HIT_TARGET_MIN, PILL_CLASS)}
        aria-label="Sign out"
        data-testid="masthead-signout-button"
      >
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </span>
  );
}
