"use client";

import { useActionState } from "react";
import { type ActionState, loginAction } from "@/app/actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {});

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl"
      >
        <h1 className="text-lg font-semibold">Trip Brain</h1>
        <p className="mt-1 text-sm text-muted">Operational dashboard.</p>

        <label htmlFor="password" className="mt-6 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          className="mt-2 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {state.error ? <p className="mt-3 text-sm text-bad">{state.error}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
