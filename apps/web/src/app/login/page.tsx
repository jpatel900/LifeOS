"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
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
    <AppShell>
      <h1>Local Supabase Login</h1>
      <p>
        Use the seeded local test user to smoke-test RLS-backed areas and raw
        capture persistence.
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={state.status === "submitting"}
          style={{ padding: "0.75rem", borderRadius: "8px" }}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={state.status === "submitting"}
          style={{ padding: "0.75rem", borderRadius: "8px" }}
        />

        <button
          type="submit"
          disabled={state.status === "submitting"}
          style={{
            padding: "0.75rem 1.5rem",
            fontSize: "1rem",
            borderRadius: "8px",
            border: "none",
            background: "#0070f3",
            color: "white",
            cursor: state.status === "submitting" ? "wait" : "pointer",
            alignSelf: "flex-start",
          }}
        >
          {state.status === "submitting" ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {state.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
            marginTop: "1rem",
          }}
        >
          <h2>Sign in failed</h2>
          <p>{state.message}</p>
        </section>
      ) : null}
    </AppShell>
  );
}
