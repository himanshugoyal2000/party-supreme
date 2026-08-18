import { notFound } from "next/navigation";
import { updateSharedBy } from "@/app/actions";
import { RetryButton } from "@/components/RetryButton";
import { StatusPill } from "@/components/StatusPill";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getReel } from "@/lib/queries";
import type { NoteMention, PlaceMention, PriceMention } from "@/lib/types";

export const dynamic = "force-dynamic";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Verbatim({ context }: { context: string }) {
  if (!context) return null;
  return <p className="mt-1 border-l-2 border-border pl-2 text-xs text-muted italic">“{context}”</p>;
}

export default async function ReelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getReel(id);
  if (!detail) notFound();

  const { reel, shares, content, duplicates } = detail;

  const places = (content?.places ?? []) as PlaceMention[];
  const prices = (content?.prices ?? []) as PriceMention[];
  const tips = (content?.tips ?? []) as NoteMention[];
  const warnings = (content?.warnings ?? []) as NoteMention[];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill status={reel.status} />
            <h1 className="text-base font-semibold">
              {reel.creator_username ? `@${reel.creator_username}` : "Reel"}
            </h1>
          </div>
          <p className="mt-1 text-xs text-muted">
            First seen {formatDateTime(reel.first_seen_at)} · {formatDuration(reel.duration_seconds)} ·{" "}
            arrived by {reel.intake_source}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {reel.permalink ? (
            <a
              href={reel.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted transition hover:text-accent"
            >
              Open on Instagram ↗
            </a>
          ) : null}
          <RetryButton reelId={reel.id} label="Re-process" />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          {reel.video_path ? (
            <video
              controls
              preload="metadata"
              poster={reel.thumbnail_path ? `/media/${reel.id}/thumb` : undefined}
              src={`/media/${reel.id}/video`}
              className="w-full rounded-xl border border-border bg-black"
            />
          ) : (
            <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
              No video stored yet.
            </div>
          )}

          {reel.caption ? (
            <div className="rounded-xl border border-border bg-surface p-4">
              <h3 className="text-xs font-semibold text-muted">Caption</h3>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{reel.caption}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          {content ? (
            <>
              {content.transcript ? (
                <Panel title="Spoken">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{content.transcript}</p>
                </Panel>
              ) : null}

              {content.on_screen_text ? (
                <Panel title="On screen">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{content.on_screen_text}</p>
                </Panel>
              ) : null}

              {places.length > 0 ? (
                <Panel title={`Places mentioned (${places.length})`}>
                  <ul className="space-y-3">
                    {places.map((place, index) => (
                      <li key={`${place.name}-${index}`}>
                        <div className="text-sm font-medium">
                          {place.name}
                          {place.kind ? <span className="ml-2 text-xs text-muted">{place.kind}</span> : null}
                          {place.location ? <span className="ml-2 text-xs text-muted">· {place.location}</span> : null}
                        </div>
                        <Verbatim context={place.verbatim_context} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {prices.length > 0 ? (
                <Panel title="Prices mentioned">
                  <ul className="space-y-3">
                    {prices.map((price, index) => (
                      <li key={`${price.item}-${index}`}>
                        <div className="text-sm">
                          <span className="font-medium">{price.amount_text}</span>
                          {price.item ? <span className="text-muted"> — {price.item}</span> : null}
                        </div>
                        <Verbatim context={price.verbatim_context} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {tips.length > 0 ? (
                <Panel title="Tips">
                  <ul className="space-y-3">
                    {tips.map((tip, index) => (
                      <li key={index}>
                        <p className="text-sm">{tip.text}</p>
                        <Verbatim context={tip.verbatim_context} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {warnings.length > 0 ? (
                <Panel title="Warnings">
                  <ul className="space-y-3">
                    {warnings.map((warning, index) => (
                      <li key={index}>
                        <p className="text-sm text-warn">{warning.text}</p>
                        <Verbatim context={warning.verbatim_context} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              {content.visual_description ? (
                <Panel title="What is shown">
                  <p className="text-sm leading-relaxed text-muted">{content.visual_description}</p>
                </Panel>
              ) : null}
            </>
          ) : (
            <Panel title="Captured content">
              <p className="text-sm text-muted">
                Nothing extracted yet. {reel.last_error ? "The last attempt failed:" : "It is still in the queue."}
              </p>
              {reel.last_error ? (
                <p className="mt-2 font-mono text-xs text-bad">{reel.last_error}</p>
              ) : null}
            </Panel>
          )}

          <Panel title={`Shares (${shares.length})`}>
            <ul className="space-y-3">
              {shares.map((share) => (
                <li key={share.id} className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted">{formatDateTime(share.shared_at)}</span>
                  <form action={updateSharedBy} className="flex items-center gap-2">
                    <input type="hidden" name="shareEventId" value={share.id} />
                    <input type="hidden" name="reelId" value={reel.id} />
                    <input
                      type="text"
                      name="sharedBy"
                      defaultValue={share.shared_by ?? ""}
                      placeholder="who shared it"
                      className="w-40 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs outline-none focus:border-accent"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
                    >
                      Save
                    </button>
                  </form>
                  <span className="text-xs text-muted">via {share.source}</span>
                </li>
              ))}
            </ul>
            {duplicates.length > 0 ? (
              <p className="mt-4 text-xs text-muted">
                {duplicates.length} duplicate {duplicates.length === 1 ? "arrival" : "arrivals"} of this reel were
                merged into this record.
              </p>
            ) : null}
          </Panel>

          <details className="rounded-xl border border-border bg-surface p-5">
            <summary className="cursor-pointer text-sm font-semibold">Diagnostics</summary>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-xs">
              <dt className="text-muted">id</dt>
              <dd className="break-all">{reel.id}</dd>
              <dt className="text-muted">status</dt>
              <dd>{reel.status}</dd>
              <dt className="text-muted">attempts</dt>
              <dd>{reel.attempts}</dd>
              <dt className="text-muted">shortcode</dt>
              <dd>{reel.shortcode ?? "—"}</dd>
              <dt className="text-muted">asset id</dt>
              <dd className="break-all">{reel.ig_asset_id ?? "—"}</dd>
              <dt className="text-muted">sha256</dt>
              <dd className="break-all">{reel.video_sha256 ?? "—"}</dd>
              <dt className="text-muted">intake ref</dt>
              <dd className="break-all">{reel.intake_ref ?? "—"}</dd>
              <dt className="text-muted">extractor</dt>
              <dd>{content ? `${content.extractor_version} · ${content.model}` : "—"}</dd>
            </dl>

            <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-surface-raised p-3 font-mono text-xs">
              {JSON.stringify(
                { raw_intake: reel.raw_intake, raw_model_output: content?.raw_model_output ?? null },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
