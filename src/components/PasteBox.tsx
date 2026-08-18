"use client";

import { useActionState } from "react";
import { type ActionState, submitPastedReels, uploadReel } from "@/app/actions";

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p className="mt-2 text-sm text-bad">{state.error}</p>;
  if (state.message) return <p className="mt-2 text-sm text-good">{state.message}</p>;
  return null;
}

export function PasteBox() {
  const [pasteState, pasteAction, pasting] = useActionState<ActionState, FormData>(submitPastedReels, {});
  const [uploadState, uploadAction, uploading] = useActionState<ActionState, FormData>(uploadReel, {});

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Add reels manually</h2>
      <p className="mt-1 text-sm text-muted">
        One link per line. Optionally prefix a name to record who shared it, like{" "}
        <code className="font-mono text-xs text-foreground">Rahul: https://instagram.com/reel/…</code>
      </p>

      <form action={pasteAction} className="mt-4">
        <textarea
          name="urls"
          rows={4}
          placeholder={"https://www.instagram.com/reel/abc123/\nAditya: https://www.instagram.com/reel/xyz789/"}
          className="w-full resize-y rounded-lg border border-border bg-surface-raised px-3 py-2 font-mono text-xs outline-none focus:border-accent"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={pasting}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {pasting ? "Queueing…" : "Queue reels"}
          </button>
        </div>
        <Feedback state={pasteState} />
      </form>

      <details className="mt-5 border-t border-border pt-4">
        <summary className="cursor-pointer text-sm text-muted transition hover:text-foreground">
          Upload a video file instead
        </summary>
        <p className="mt-2 text-sm text-muted">
          For the rare reel Instagram will not serve to us. Save it from the app, then upload the file here.
        </p>
        <form action={uploadAction} className="mt-3 space-y-3">
          <input
            type="file"
            name="video"
            accept="video/*"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
          <input
            type="text"
            name="sharedBy"
            placeholder="Who shared it (optional)"
            className="w-full max-w-xs rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={uploading}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:border-accent disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <Feedback state={uploadState} />
        </form>
      </details>
    </section>
  );
}
