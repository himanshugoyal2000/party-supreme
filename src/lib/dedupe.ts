import { unlink } from "node:fs/promises";
import { sql } from "./db";
import { absolutePath } from "./storage";

export interface DedupeOutcome {
  canonicalReelId: string;
  merged: boolean;
}

/**
 * The content hash is the one identifier both intake paths agree on, so it is where
 * real duplicate detection happens. When the same reel has arrived twice -- forwarded
 * by three friends, or once forwarded and once pasted -- the newer row is folded into
 * the older one and every share event is repointed at it.
 *
 * Nothing is deleted. The duplicate row survives with status 'merged' and a
 * merged_into pointer, so the audit trail stays intact.
 */
export async function dedupeByContentHash(reelId: string, sha256: string): Promise<DedupeOutcome> {
  const outcome = await sql.begin(async (tx) => {
    const [canonical] = await tx<{ id: string }[]>`
      select id
      from reels
      where video_sha256 = ${sha256}
        and id <> ${reelId}
        and status <> 'merged'
      order by first_seen_at asc
      limit 1
    `;

    if (!canonical) {
      await tx`update reels set video_sha256 = ${sha256} where id = ${reelId}`;
      return { canonicalReelId: reelId, merged: false };
    }

    await tx`update share_events set reel_id = ${canonical.id} where reel_id = ${reelId}`;

    // Carry over anything the duplicate knew that the canonical row does not.
    await tx`
      update reels canonical
      set shortcode = coalesce(canonical.shortcode, duplicate.shortcode),
          permalink = coalesce(canonical.permalink, duplicate.permalink),
          ig_asset_id = coalesce(canonical.ig_asset_id, duplicate.ig_asset_id),
          caption = coalesce(canonical.caption, duplicate.caption),
          creator_username = coalesce(canonical.creator_username, duplicate.creator_username)
      from reels duplicate
      where canonical.id = ${canonical.id}
        and duplicate.id = ${reelId}
    `;

    await tx`
      update reels
      set status = 'merged',
          merged_into = ${canonical.id},
          video_path = null,
          thumbnail_path = null,
          last_error = null,
          processed_at = now()
      where id = ${reelId}
    `;

    return { canonicalReelId: canonical.id, merged: true };
  });

  const result = outcome as DedupeOutcome;

  if (result.merged) {
    // The canonical row already holds byte-identical media, so the copy is redundant.
    await unlink(absolutePath(`videos/${reelId}.mp4`)).catch(() => {});
    await unlink(absolutePath(`thumbnails/${reelId}.jpg`)).catch(() => {});
  }

  return result;
}
