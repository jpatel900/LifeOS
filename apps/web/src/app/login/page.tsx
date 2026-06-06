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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("user_a@example.test");
  const [password, setPassword] = useState("password123");
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

    router.push("/settings/areas");
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-md items-center">
      <Card className="workflow-primary-card workflow-flagship-card w-full">
        <CardHeader className="space-y-3">
          <p className="workflow-surface-kicker">Persisted paths</p>
          <CardTitle className="workflow-surface-title text-3xl font-semibold leading-tight">
            Local Supabase Login
          </CardTitle>
          <CardDescription className="workflow-surface-body text-sm">
            Sign in to test saved account flows instead of local-only mode.
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
