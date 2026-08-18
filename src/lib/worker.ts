import { sql } from "./db";
import { dedupeByContentHash } from "./dedupe";
import { env } from "./env";
import { EXTRACTOR_VERSION, extractFromVideo } from "./extract";
import { MediaUnavailableError, resolveMedia } from "./fetch-video";
import { extractThumbnail, probeDurationSeconds, sha256File } from "./media";
import { absolutePath, ensureStorageDirs, thumbnailRelativePath, videoRelativePath } from "./storage";
import type { ReelRow } from "./types";

const IDLE_POLL_MS = 5_000;
const HEARTBEAT_MS = 30_000;
/** How long a claimed reel is invisible to other claimants. Doubles as crash recovery. */
const LEASE_MINUTES = 10;

function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(0, attempts - 1), 3600);
}

/**
 * Leases one reel. Incrementing next_attempt_at at claim time means a crash mid-job
 * simply makes the reel eligible again once the lease lapses, so work is never
 * silently lost. SKIP LOCKED keeps this correct if a second instance ever runs.
 */
async function claimReel(): Promise<ReelRow | null> {
  const [reel] = await sql<ReelRow[]>`
    update reels
    set attempts = attempts + 1,
        next_attempt_at = now() + ${`${LEASE_MINUTES} minutes`}::interval
    where id = (
      select id
      from reels
      where status in ('pending', 'fetched')
        and next_attempt_at <= now()
        and attempts < ${env().MAX_ATTEMPTS}
      order by next_attempt_at asc
      for update skip locked
      limit 1
    )
    returning *
  `;

  return reel ?? null;
}

async function runFetchStage(reel: ReelRow): Promise<void> {
  if (!reel.intake_ref) {
    throw new MediaUnavailableError("No intake reference was recorded, so there is nothing to fetch");
  }

  const videoRelative = videoRelativePath(reel.id);
  const metadata = await resolveMedia(reel.intake_ref, videoRelative);

  const absolute = absolutePath(videoRelative);
  const hash = await sha256File(absolute);
  const duration = await probeDurationSeconds(absolute);

  const thumbnailRelative = thumbnailRelativePath(reel.id);
  const hasThumbnail = await extractThumbnail(absolute, absolutePath(thumbnailRelative));

  await sql`
    update reels
    set video_path = ${videoRelative},
        thumbnail_path = ${hasThumbnail ? thumbnailRelative : null},
        duration_seconds = ${duration},
        caption = coalesce(caption, ${metadata.caption}),
        creator_username = coalesce(creator_username, ${metadata.creatorUsername}),
        permalink = coalesce(permalink, ${metadata.permalink}),
        status = 'fetched',
        attempts = 0,
        next_attempt_at = now(),
        last_error = null,
        fetched_at = now()
    where id = ${reel.id}
  `;

  // Guarded separately because shortcode is unique and another row may already claim it.
  if (metadata.shortcode) {
    await sql`
      update reels
      set shortcode = ${metadata.shortcode}
      where id = ${reel.id}
        and shortcode is null
        and not exists (select 1 from reels other where other.shortcode = ${metadata.shortcode})
    `;
  }

  await dedupeByContentHash(reel.id, hash);
}

async function runExtractStage(reel: ReelRow): Promise<void> {
  if (!reel.video_path) {
    throw new MediaUnavailableError("Reel is marked fetched but has no stored video");
  }

  const { extraction, raw, model } = await extractFromVideo(reel.video_path, reel.caption);

  await sql`
    insert into captured_content (
      reel_id, extractor_version, model, language, has_speech,
      transcript, on_screen_text, visual_description,
      places, prices, tips, warnings, raw_model_output
    ) values (
      ${reel.id}, ${EXTRACTOR_VERSION}, ${model}, ${extraction.language}, ${extraction.hasSpeech},
      ${extraction.transcript}, ${extraction.onScreenText}, ${extraction.visualDescription},
      ${sql.json(extraction.places as never)}, ${sql.json(extraction.prices as never)},
      ${sql.json(extraction.tips as never)}, ${sql.json(extraction.warnings as never)},
      ${sql.json(raw as never)}
    )
    on conflict (reel_id, extractor_version) do update
    set model = excluded.model,
        language = excluded.language,
        has_speech = excluded.has_speech,
        transcript = excluded.transcript,
        on_screen_text = excluded.on_screen_text,
        visual_description = excluded.visual_description,
        places = excluded.places,
        prices = excluded.prices,
        tips = excluded.tips,
        warnings = excluded.warnings,
        raw_model_output = excluded.raw_model_output,
        created_at = now()
  `;

  await sql`
    update reels
    set status = 'done', attempts = 0, next_attempt_at = now(), last_error = null, processed_at = now()
    where id = ${reel.id}
  `;
}

async function recordFailure(reel: ReelRow, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  // A permanently unavailable reel is parked rather than retried, but it is never
  // deleted -- the share and the raw payload stay in the dataset.
  if (error instanceof MediaUnavailableError) {
    await sql`
      update reels set status = 'unavailable', last_error = ${message} where id = ${reel.id}
    `;
    return;
  }

  if (reel.attempts >= env().MAX_ATTEMPTS) {
    await sql`
      update reels set status = 'failed', last_error = ${message} where id = ${reel.id}
    `;
    return;
  }

  await sql`
    update reels
    set last_error = ${message},
        next_attempt_at = now() + ${`${backoffSeconds(reel.attempts)} seconds`}::interval
    where id = ${reel.id}
  `;
}

/** Returns true when work was done, so the loop can keep going without sleeping. */
async function processOne(): Promise<boolean> {
  const reel = await claimReel();
  if (!reel) return false;

  try {
    if (reel.status === "pending") {
      await runFetchStage(reel);
    } else {
      await runExtractStage(reel);
    }
  } catch (error) {
    console.error(`[worker] reel ${reel.id} (${reel.status}) failed:`, error);
    await recordFailure(reel, error).catch((cause) =>
      console.error(`[worker] could not record failure for ${reel.id}:`, cause),
    );
  }

  return true;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function workLoop(): Promise<void> {
  for (;;) {
    try {
      if (!(await processOne())) await sleep(IDLE_POLL_MS);
    } catch (error) {
      console.error("[worker] loop error:", error);
      await sql`update system_status set last_error = ${String(error)}, updated_at = now() where id = true`.catch(
        () => {},
      );
      await sleep(IDLE_POLL_MS);
    }
  }
}

async function heartbeatLoop(): Promise<void> {
  for (;;) {
    await sql`
      update system_status set worker_heartbeat_at = now(), updated_at = now() where id = true
    `.catch((error) => console.error("[worker] heartbeat failed:", error));
    await sleep(HEARTBEAT_MS);
  }
}

declare global {
  var __tripBrainWorkerStarted: boolean | undefined;
}

export async function startWorker(): Promise<void> {
  if (globalThis.__tripBrainWorkerStarted) return;
  if (!env().WORKER_ENABLED) {
    console.log("[worker] disabled by WORKER_ENABLED");
    return;
  }

  globalThis.__tripBrainWorkerStarted = true;

  await ensureStorageDirs();
  console.log("[worker] started");

  void workLoop();
  void heartbeatLoop();
}
