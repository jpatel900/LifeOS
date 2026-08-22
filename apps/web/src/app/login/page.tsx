"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

type LoginState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

// #687 finding 4 (C2-S7, trust-critical): #581 gated the seed-account
// prefill on `NODE_ENV !== "production"`, on the assumption that only a
// deployed build would ever be a "real" first look at this screen. That
// assumption was wrong for a single-user, not-yet-publicly-deployed app —
// `pnpm dev` (NODE_ENV=development) is how the shipped page actually gets
// looked at, so a fresh browser context routinely rendered someone else's
// email and a masked password already filled in, which reads as a real
// signed-in account rather than an empty sign-in door. Removed entirely,
// unconditionally: the fields start empty in every environment. E2E specs
// that need the seeded local account (`tests/e2e/helpers/signedInAccount.ts`'s
// `signIn()`) already fill both fields programmatically via
// `page.getByLabel(...).fill(...)` — none of them relied on this default
// value, so nothing there changes.

// #688: return the person to the page they came from after signing in. Only
// same-app paths are honored — the value must be a single leading-slash path
// (never "//host" or "http://…"), so a crafted ?next= can't bounce a
// freshly-signed-in session to an external site. Anything else falls back to
// Today ("/"), which also owns the first-use decision (see the success
// handler below).
function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams?.get("next") ?? null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<LoginState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const client = createSupabaseBrowserClient();

    if (!client) {
      setState({
        status: "error",
        // #692 plain language: no vendor/config vocabulary — say what it means
        // for the person.
        message:
          "Accounts aren't set up here yet, so there's nothing to sign in to. Your notes stay in this browser.",
      });
      return;
    }

    const { error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setState({ status: "error", message: error.message });
      return;
    }

    // #592: route to Today (`/`) on success by default, not Settings — Today
    // owns the first-use decision (the deterministic zero-state predicate in
    // lib/onboarding/onboarding.ts decides whether the onboarding ritual
    // appears). Routing straight to Settings bypassed that predicate
    // entirely, so a brand-new account never saw the ritual.
    // #688: if the person arrived from a specific page (?next=), return them
    // there instead — `safeNextPath` already guaranteed it's a same-app path.
    router.push(nextPath);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-md items-center">
      <Card className="workflow-primary-card workflow-flagship-card w-full">
        <CardHeader className="space-y-3">
          <CardTitle className="login-title">Sign in</CardTitle>
          <CardDescription className="workflow-surface-body text-sm">
            Sign in to keep your notes and areas saved to your account, so they
            follow you on every device — not just this one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={state.status === "submitting"}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={state.status === "submitting"}
              />
            </div>

            <Button type="submit" disabled={state.status === "submitting"}>
              {state.status === "submitting" ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          {state.status === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>Sign in failed</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          {/* #687 round-11 fresh-eyes judge (defect 7, "/login is a dead
              end"): no links, no skip link, no header — browser Back or
              hand-editing the URL was the only way out. Structural fix only
              (not a redesign): the same single "go home" escape hatch
              `not-found.tsx` already offers, at the bottom of the SAME card
              rather than a new header, since this page deliberately has no
              shell of its own. `ghost` variant keeps it visually secondary
              to the primary "Sign in" action above. */}
          <Button asChild variant="ghost" className="w-full">
            <Link href="/">Go to Today</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

// #688: `useSearchParams` (the ?next= return target) opts this route out of
// static prerendering unless it sits under a Suspense boundary — without one
// `next build` fails on /login outright. The fallback mirrors the card's
// frame so the shell doesn't jump when the form swaps in.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-md items-center">
          <Card className="workflow-primary-card workflow-flagship-card w-full">
            <CardHeader className="space-y-3">
              <CardTitle className="login-title">Sign in</CardTitle>
            </CardHeader>
          </Card>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
