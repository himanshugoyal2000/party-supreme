import { retryReel } from "@/app/actions";

export function RetryButton({ reelId, label = "Retry" }: { reelId: string; label?: string }) {
  return (
    <form action={retryReel}>
      <input type="hidden" name="reelId" value={reelId} />
      <button
        type="submit"
        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition hover:border-accent hover:text-accent"
      >
        {label}
      </button>
    </form>
  );
}
