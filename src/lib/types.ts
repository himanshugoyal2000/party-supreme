export type ReelStatus = "pending" | "fetched" | "done" | "failed" | "unavailable" | "merged";

export type IntakeSource = "webhook" | "paste" | "upload";

export interface ReelRow {
  id: string;
  ig_asset_id: string | null;
  shortcode: string | null;
  video_sha256: string | null;
  permalink: string | null;
  creator_username: string | null;
  caption: string | null;
  duration_seconds: string | null;
  video_path: string | null;
  thumbnail_path: string | null;
  status: ReelStatus;
  merged_into: string | null;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  intake_source: IntakeSource;
  intake_ref: string | null;
  raw_intake: unknown;
  first_seen_at: string;
  fetched_at: string | null;
  processed_at: string | null;
}

export interface ShareEventRow {
  id: string;
  reel_id: string;
  ig_message_id: string | null;
  shared_by: string | null;
  shared_at: string;
  source: IntakeSource;
  raw_item: unknown;
  created_at: string;
}

export interface PlaceMention {
  name: string;
  kind: string | null;
  location: string | null;
  verbatim_context: string;
}

export interface PriceMention {
  item: string;
  amount_text: string;
  verbatim_context: string;
}

export interface NoteMention {
  text: string;
  verbatim_context: string;
}

export interface CapturedContentRow {
  id: string;
  reel_id: string;
  extractor_version: string;
  model: string;
  language: string | null;
  has_speech: boolean | null;
  transcript: string | null;
  on_screen_text: string | null;
  visual_description: string | null;
  places: PlaceMention[];
  prices: PriceMention[];
  tips: NoteMention[];
  warnings: NoteMention[];
  raw_model_output: unknown;
  created_at: string;
}
