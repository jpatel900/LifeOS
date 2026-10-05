"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AuthPresence =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "signed-in"; label: string };

function shortLabel(email: string | null | undefined): string {
  if (!email) return "Signed in";
  const handle = email.split("@")[0] ?? email;
  return handle.length > 0 ? handle : "Signed in";
}

// The auth door and Sort recovery read the same SDK session signals.
// Save mode is not proof that somebody is currently signed in.
export function useAuthPresence() {
  const [presence, setPresence] = useState<AuthPresence>({ status: "loading" });
  const revision = useRef(0);

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
    const initialRevision = ++revision.current;
    void client.auth
      .getUser()
      .then(({ data, error }) => {
        if (!active || revision.current !== initialRevision) return;
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
        if (active && revision.current === initialRevision) {
          setPresence({ status: "signed-out" });
        }
      });

    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        // An older initial read cannot undo a newer sign-in/sign-out event.
        revision.current += 1;
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

  function markSignedOut() {
    revision.current += 1;
    setPresence({ status: "signed-out" });
  }

  return { presence, markSignedOut };
}
