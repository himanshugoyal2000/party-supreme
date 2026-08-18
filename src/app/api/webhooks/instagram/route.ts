import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { extractInstagramUrls } from "@/lib/instagram-url";
import { recordIntake } from "@/lib/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Attachment types Meta uses for a shared or sent reel. */
const MEDIA_TYPES = new Set(["share", "ig_reel", "reel", "video"]);

interface Attachment {
  type?: string;
  payload?: { url?: string };
}

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    attachments?: Attachment[];
  };
}

interface WebhookPayload {
  object?: string;
  entry?: { id?: string; time?: number; messaging?: MessagingEvent[] }[];
}

/** Meta's subscription handshake. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const expected = env().IG_WEBHOOK_VERIFY_TOKEN;
  const challenge = params.get("hub.challenge");

  if (params.get("hub.mode") === "subscribe" && expected && params.get("hub.verify_token") === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new Response("Forbidden", { status: 403 });
}

function isSignatureValid(rawBody: string, header: string | null): boolean {
  const secret = env().IG_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;

  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const provided = Buffer.from(header.slice("sha256=".length), "hex");

  if (expected.length !== provided.length || expected.length === 0) return false;
  return timingSafeEqual(expected, provided);
}

function assetIdFrom(url: string): string | null {
  try {
    return new URL(url).searchParams.get("asset_id");
  } catch {
    return null;
  }
}

/**
 * Records forwarded reels. Meta gives us five seconds and delivers at least once, so this
 * only writes rows -- downloading the signed CDN asset is the worker's job, which it picks
 * up within seconds.
 *
 * Failures deliberately answer 500 so Meta retries. Losing a reel is worse than a retry.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  if (!isSignatureValid(rawBody, request.headers.get("x-hub-signature-256"))) {
    console.warn("[webhook] rejected a request with an invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const message = event.message;
        if (!message || message.is_echo || message.is_deleted) continue;

        const sharedAt = event.timestamp ? new Date(event.timestamp) : new Date();
        const baseId = message.mid ?? null;
        const raw = { entryId: entry.id, event };

        const attachments = (message.attachments ?? []).filter(
          (attachment) => attachment.payload?.url && MEDIA_TYPES.has(attachment.type ?? ""),
        );

        for (const [index, attachment] of attachments.entries()) {
          const url = attachment.payload!.url!;
          await recordIntake({
            source: "webhook",
            intakeRef: url,
            igAssetId: assetIdFrom(url),
            // One message can carry several attachments, so the mid alone is not unique.
            igMessageId: baseId ? `${baseId}#${index}` : null,
            sharedAt,
            raw: { ...raw, attachment },
          });
        }

        // Covers pasting a link into the DM instead of forwarding, which is the only way
        // to preserve the permalink and caption.
        if (attachments.length === 0 && message.text) {
          for (const [index, link] of extractInstagramUrls(message.text).entries()) {
            await recordIntake({
              source: "webhook",
              intakeRef: link.url,
              shortcode: link.shortcode,
              permalink: link.url,
              igMessageId: baseId ? `${baseId}#text${index}` : null,
              sharedAt,
              raw,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("[webhook] failed to record intake, asking Meta to retry:", error);
    return new Response("Internal error", { status: 500 });
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
