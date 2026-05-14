"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
          "Supabase is not configured. Add local Supabase env vars to use login, or continue in mock mode.",
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
    <>
      <h1>Local Supabase Login</h1>
      <p>Sign in to test persisted workflow paths with local Supabase.</p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <label htmlFor="email">Email</label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={state.status === "submitting"}
        />

        <label htmlFor="password">Password</label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={state.status === "submitting"}
        />

        <Button
          type="submit"
          disabled={state.status === "submitting"}
        >
          {state.status === "submitting" ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      {state.status === "error" ? (
        <Alert variant="destructive" style={{ marginTop: "1rem" }}>
          <AlertTitle>Sign in failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

