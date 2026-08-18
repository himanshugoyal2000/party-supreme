import { ReelCard } from "@/components/ReelCard";
import { listReels } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ReelsPage() {
  const reels = await listReels({ limit: 500 });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-sm font-semibold">All reels</h1>
        <span className="text-xs text-muted">{reels.length} shown</span>
      </div>

      {reels.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          Nothing captured yet.
        </p>
      ) : (
        <div className="space-y-3">
          {reels.map((reel) => (
            <ReelCard key={reel.id} reel={reel} />
          ))}
        </div>
      )}
    </div>
  );
}
