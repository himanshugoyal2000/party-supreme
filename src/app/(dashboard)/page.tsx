import Link from "next/link";
import { PasteBox } from "@/components/PasteBox";
import { ReelCard } from "@/components/ReelCard";
import { isHeartbeatStale, relativeTime } from "@/lib/format";
import { getOverview, listReels } from "@/lib/queries";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "";

  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

export default async function OverviewPage() {
  const [overview, recent] = await Promise.all([getOverview(), listReels({ limit: 8 })]);

  const stale = isHeartbeatStale(overview.workerHeartbeatAt);
  const problems = overview.failed + overview.unavailable;

  return (
    <div className="space-y-6">
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          stale ? "border-bad/40 bg-bad/10 text-bad" : "border-good/30 bg-good/5 text-good"
        }`}
      >
        <div className="font-medium">
          {stale ? "The worker is not running" : "Pipeline healthy"}
        </div>
        <div className="mt-1 text-xs text-muted">
          Worker heartbeat {relativeTime(overview.workerHeartbeatAt)} · last reel added{" "}
          {relativeTime(overview.lastIntakeAt)} · last forwarded reel {relativeTime(overview.lastWebhookAt)}
        </div>
        {overview.lastError ? (
          <div className="mt-2 font-mono text-xs text-bad">{overview.lastError}</div>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="reels captured" value={overview.captured} tone="good" />
        <Stat label="in progress" value={overview.inProgress} tone={overview.inProgress > 0 ? "warn" : undefined} />
        <Stat label="need attention" value={problems} tone={problems > 0 ? "bad" : undefined} />
        <Stat label="reels total" value={overview.totalReels} />
        <Stat label="shares recorded" value={overview.totalShares} />
        <Stat label="duplicates merged" value={overview.duplicatesMerged} />
      </section>

      <PasteBox />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Latest reels</h2>
          <Link href="/reels" className="text-sm text-muted transition hover:text-foreground">
            See all
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
            Nothing captured yet. Paste a reel link above to test the pipeline.
          </p>
        ) : (
          <div className="space-y-3">
            {recent.map((reel) => (
              <ReelCard key={reel.id} reel={reel} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
