import Link from "next/link";
import { RetryButton } from "@/components/RetryButton";
import { StatusPill } from "@/components/StatusPill";
import { formatDuration, relativeTime } from "@/lib/format";
import type { ReelListItem } from "@/lib/queries";

export function ReelCard({ reel }: { reel: ReelListItem }) {
  const needsAttention = reel.status === "failed" || reel.status === "unavailable";

  return (
    <article className="flex gap-4 rounded-xl border border-border bg-surface p-4">
      <Link
        href={`/reels/${reel.id}`}
        className="relative block h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-raised"
      >
        {reel.thumbnail_path ? (
          // eslint-disable-next-line @next/next/no-img-element -- local volume file, not an optimisable remote asset
          <img
            src={`/media/${reel.id}/thumb`}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs text-muted">no
            <br />
            preview
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={reel.status} />
          <span className="text-xs text-muted">
            {relativeTime(reel.first_seen_at)}
            {reel.duration_seconds ? ` · ${formatDuration(reel.duration_seconds)}` : ""}
            {reel.share_count > 1 ? ` · shared ${reel.share_count}×` : ""}
          </span>
        </div>

        <h3 className="mt-1.5 truncate text-sm font-medium">
          <Link href={`/reels/${reel.id}`} className="transition hover:text-accent">
            {reel.creator_username ? `@${reel.creator_username}` : "Reel"}
            {reel.place_names.length > 0 ? ` — ${reel.place_names.slice(0, 3).join(", ")}` : ""}
          </Link>
        </h3>

        {reel.sharers.length > 0 ? (
          <p className="mt-1 text-xs text-muted">Shared by {reel.sharers.join(", ")}</p>
        ) : null}

        {needsAttention && reel.last_error ? (
          <p className="mt-2 line-clamp-2 font-mono text-xs text-bad">{reel.last_error}</p>
        ) : null}

        {reel.caption ? <p className="mt-2 line-clamp-2 text-xs text-muted">{reel.caption}</p> : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {needsAttention ? <RetryButton reelId={reel.id} /> : null}
        {reel.permalink ? (
          <a
            href={reel.permalink}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted transition hover:text-accent"
          >
            Instagram ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}
