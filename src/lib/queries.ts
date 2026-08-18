import { sql } from "./db";
import { EXTRACTOR_VERSION } from "./extract";
import type { CapturedContentRow, ReelRow, ShareEventRow } from "./types";

export interface Overview {
  totalReels: number;
  captured: number;
  inProgress: number;
  failed: number;
  unavailable: number;
  duplicatesMerged: number;
  totalShares: number;
  workerHeartbeatAt: string | null;
  lastWebhookAt: string | null;
  lastIntakeAt: string | null;
  lastError: string | null;
}

export interface ReelListItem extends ReelRow {
  share_count: number;
  sharers: string[];
  place_names: string[];
  has_content: boolean;
}

export async function getOverview(): Promise<Overview> {
  const [counts] = await sql<
    {
      total: number;
      captured: number;
      in_progress: number;
      failed: number;
      unavailable: number;
      merged: number;
    }[]
  >`
    select
      count(*) filter (where status <> 'merged')::int              as total,
      count(*) filter (where status = 'done')::int                 as captured,
      count(*) filter (where status in ('pending', 'fetched'))::int as in_progress,
      count(*) filter (where status = 'failed')::int               as failed,
      count(*) filter (where status = 'unavailable')::int          as unavailable,
      count(*) filter (where status = 'merged')::int               as merged
    from reels
  `;

  const [shares] = await sql<{ total: number }[]>`select count(*)::int as total from share_events`;

  const [status] = await sql<
    {
      worker_heartbeat_at: string | null;
      last_webhook_at: string | null;
      last_intake_at: string | null;
      last_error: string | null;
    }[]
  >`select worker_heartbeat_at, last_webhook_at, last_intake_at, last_error from system_status where id = true`;

  return {
    totalReels: counts?.total ?? 0,
    captured: counts?.captured ?? 0,
    inProgress: counts?.in_progress ?? 0,
    failed: counts?.failed ?? 0,
    unavailable: counts?.unavailable ?? 0,
    duplicatesMerged: counts?.merged ?? 0,
    totalShares: shares?.total ?? 0,
    workerHeartbeatAt: status?.worker_heartbeat_at ?? null,
    lastWebhookAt: status?.last_webhook_at ?? null,
    lastIntakeAt: status?.last_intake_at ?? null,
    lastError: status?.last_error ?? null,
  };
}

export async function listReels(options: { limit?: number; onlyProblems?: boolean } = {}): Promise<ReelListItem[]> {
  const limit = options.limit ?? 100;

  return sql<ReelListItem[]>`
    select
      r.*,
      (select count(*) from share_events se where se.reel_id = r.id)::int as share_count,
      coalesce(
        (
          select array_agg(distinct se.shared_by)
          from share_events se
          where se.reel_id = r.id and se.shared_by is not null
        ),
        '{}'
      ) as sharers,
      coalesce(
        (
          select array_agg(place->>'name')
          from jsonb_array_elements(cc.places) as place
        ),
        '{}'
      ) as place_names,
      (cc.id is not null) as has_content
    from reels r
    left join captured_content cc
      on cc.reel_id = r.id and cc.extractor_version = ${EXTRACTOR_VERSION}
    where r.status <> 'merged'
      and (${options.onlyProblems ?? false} = false or r.status in ('failed', 'unavailable'))
    order by r.first_seen_at desc
    limit ${limit}
  `;
}

export interface ReelDetail {
  reel: ReelRow;
  shares: ShareEventRow[];
  content: CapturedContentRow | null;
  duplicates: { id: string; first_seen_at: string }[];
}

export async function getReel(id: string): Promise<ReelDetail | null> {
  const [reel] = await sql<ReelRow[]>`select * from reels where id = ${id}`;
  if (!reel) return null;

  const shares = await sql<ShareEventRow[]>`
    select * from share_events where reel_id = ${id} order by shared_at asc
  `;

  const [content] = await sql<CapturedContentRow[]>`
    select * from captured_content
    where reel_id = ${id}
    order by created_at desc
    limit 1
  `;

  const duplicates = await sql<{ id: string; first_seen_at: string }[]>`
    select id, first_seen_at from reels where merged_into = ${id}
  `;

  return { reel, shares, content: content ?? null, duplicates: [...duplicates] };
}
