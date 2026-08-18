import { sql } from "./db";
import type { IntakeSource } from "./types";

export interface IntakeInput {
  source: IntakeSource;
  /**
   * How the fetch stage will get the bytes. One of:
   *   https://lookaside.fbsbx.com/...    signed Meta CDN asset (forwarded reel)
   *   https://www.instagram.com/reel/... permalink, resolved with yt-dlp
   *   local:tmp/<name>                   already on the volume (direct upload)
   */
  intakeRef: string;
  igAssetId?: string | null;
  shortcode?: string | null;
  permalink?: string | null;
  igMessageId?: string | null;
  sharedBy?: string | null;
  sharedAt?: Date | null;
  raw?: unknown;
}

export interface IntakeResult {
  reelId: string;
  createdReel: boolean;
  duplicateShare: boolean;
}

/**
 * Records one share. Idempotent on ig_message_id so Meta's at-least-once webhook
 * delivery cannot double-count, and dedupes on the identifiers we have at intake
 * time. The stronger content-hash dedupe happens later, once bytes exist.
 *
 * Following the PRD, an unrecognisable payload still creates a reel row rather than
 * being dropped: missing data is worse than duplicate data.
 */
export async function recordIntake(input: IntakeInput): Promise<IntakeResult> {
  const result = await sql.begin(async (tx) => {
    if (input.igMessageId) {
      const [seen] = await tx<{ reel_id: string }[]>`
        select reel_id from share_events where ig_message_id = ${input.igMessageId} limit 1
      `;
      if (seen) {
        return { reelId: seen.reel_id, createdReel: false, duplicateShare: true };
      }
    }

    let reelId: string | undefined;

    if (input.igAssetId) {
      const [found] = await tx<{ id: string }[]>`
        select id from reels where ig_asset_id = ${input.igAssetId} limit 1
      `;
      reelId = found?.id;
    }

    if (!reelId && input.shortcode) {
      const [found] = await tx<{ id: string }[]>`
        select id from reels where shortcode = ${input.shortcode} limit 1
      `;
      reelId = found?.id;
    }

    let createdReel = false;

    if (reelId) {
      // A reel first seen as a forward has no shortcode or permalink. If the same reel
      // later arrives as a pasted link, take the opportunity to enrich it.
      await tx`
        update reels
        set shortcode = coalesce(shortcode, ${input.shortcode ?? null}),
            permalink = coalesce(permalink, ${input.permalink ?? null}),
            ig_asset_id = coalesce(ig_asset_id, ${input.igAssetId ?? null})
        where id = ${reelId}
      `;
    } else {
      const [created] = await tx<{ id: string }[]>`
        insert into reels (ig_asset_id, shortcode, permalink, intake_source, intake_ref, raw_intake)
        values (
          ${input.igAssetId ?? null},
          ${input.shortcode ?? null},
          ${input.permalink ?? null},
          ${input.source},
          ${input.intakeRef},
          ${tx.json((input.raw ?? {}) as never)}
        )
        returning id
      `;
      reelId = created.id;
      createdReel = true;
    }

    await tx`
      insert into share_events (reel_id, ig_message_id, shared_by, shared_at, source, raw_item)
      values (
        ${reelId},
        ${input.igMessageId ?? null},
        ${input.sharedBy ?? null},
        ${input.sharedAt ?? new Date()},
        ${input.source},
        ${tx.json((input.raw ?? {}) as never)}
      )
    `;

    await tx`
      update system_status
      set last_intake_at = now(),
          last_webhook_at = case when ${input.source} = 'webhook' then now() else last_webhook_at end,
          updated_at = now()
      where id = true
    `;

    return { reelId, createdReel, duplicateShare: false };
  });

  return result as IntakeResult;
}

/** Re-queues a reel from the dashboard. Clears the dead-letter state. */
export async function requeueReel(reelId: string): Promise<void> {
  await sql`
    update reels
    set status = case when video_path is not null then 'fetched' else 'pending' end,
        attempts = 0,
        next_attempt_at = now(),
        last_error = null
    where id = ${reelId}
      and status <> 'merged'
  `;
}

export async function setSharedBy(shareEventId: string, sharedBy: string | null): Promise<void> {
  await sql`
    update share_events
    set shared_by = ${sharedBy && sharedBy.trim() ? sharedBy.trim() : null}
    where id = ${shareEventId}
  `;
}
