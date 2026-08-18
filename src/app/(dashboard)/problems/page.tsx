import { ReelCard } from "@/components/ReelCard";
import { listReels } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProblemsPage() {
  const reels = await listReels({ limit: 500, onlyProblems: true });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-sm font-semibold">Needs attention</h1>
        <p className="mt-1 text-sm text-muted">
          Reels that exhausted their retries, or that Instagram will not serve. Nothing here is lost — the share
          and the original payload are still stored, so a retry can pick them up whenever the cause is fixed.
        </p>
      </div>

      {reels.length === 0 ? (
        <p className="rounded-xl border border-good/30 bg-good/5 p-6 text-sm text-good">
          Nothing is stuck.
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
