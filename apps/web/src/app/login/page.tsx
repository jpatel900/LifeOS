"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
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

// #581 (audit "first-use experience"): the local test credentials prefill
// only outside production — the same NODE_ENV production guard the Google
// OAuth config uses (lib/googleCalendar/oauth.ts). A real deployment gets
// empty fields; local dev and tests keep the one-click sign-in.
const DEV_CREDENTIAL_PREFILL = process.env.NODE_ENV !== "production";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(
    DEV_CREDENTIAL_PREFILL ? "user_a@example.test" : "",
  );
  const [password, setPassword] = useState(
    DEV_CREDENTIAL_PREFILL ? "password123" : "",
  );
  const [state, setState] = useState<LoginState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const client = createSupabaseBrowserClient();

    if (!client) {
      setState({
        status: "error",
        message:
          "Supabase is not configured. Add local Supabase env vars to use login, or continue in local-only mode.",
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

    // #592: route to Today (`/`) on success, not Settings — Today owns the
    // first-use decision (the deterministic zero-state predicate in
    // lib/onboarding/onboarding.ts decides whether the onboarding ritual
    // appears). Routing straight to Settings bypassed that predicate
    // entirely, so a brand-new account never saw the ritual.
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-md items-center">
      <Card className="workflow-primary-card workflow-flagship-card w-full">
        <CardHeader className="space-y-3">
          <CardTitle className="login-title">Sign in</CardTitle>
          <CardDescription className="workflow-surface-body text-sm">
            Sign in to keep your areas and captures saved to your account and in
            sync wherever you use LifeOS.
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
        </CardContent>
      </Card>
    </main>
  );
}
