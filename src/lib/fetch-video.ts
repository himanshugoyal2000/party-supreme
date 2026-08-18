import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { rename, stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { isLookasideUrl, parseInstagramUrl } from "./instagram-url";
import { absolutePath } from "./storage";

const run = promisify(execFile);

const MAX_BYTES = 200 * 1024 * 1024;
const MAX_STDOUT = 32 * 1024 * 1024;

/** The media is gone for good. Retrying will not help, so the reel is parked. */
export class MediaUnavailableError extends Error {
  override name = "MediaUnavailableError";
}

/** Something transient or operator-fixable. Worth another attempt. */
export class MediaFetchError extends Error {
  override name = "MediaFetchError";
}

export interface FetchedMetadata {
  caption: string | null;
  creatorUsername: string | null;
  permalink: string | null;
  shortcode: string | null;
}

const NO_METADATA: FetchedMetadata = {
  caption: null,
  creatorUsername: null,
  permalink: null,
  shortcode: null,
};

async function downloadUrlToFile(url: string, destination: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch (cause) {
    throw new MediaFetchError(`Network error fetching media: ${(cause as Error).message}`);
  }

  if (response.status === 404 || response.status === 410) {
    throw new MediaUnavailableError(`Media no longer available (HTTP ${response.status})`);
  }
  if (!response.ok || !response.body) {
    throw new MediaFetchError(`Unexpected response fetching media (HTTP ${response.status})`);
  }

  // A signed CDN link that has expired answers with JSON or HTML rather than a video.
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json") || contentType.includes("html")) {
    throw new MediaUnavailableError(
      `Expected a video but the CDN returned ${contentType}; the signed link has most likely expired`,
    );
  }

  let bytes = 0;
  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      async function* (source) {
        for await (const chunk of source) {
          bytes += (chunk as Buffer).length;
          if (bytes > MAX_BYTES) {
            throw new MediaFetchError(`Media exceeds the ${MAX_BYTES / 1024 / 1024}MB cap`);
          }
          yield chunk;
        }
      },
      createWriteStream(destination),
    );
  } catch (cause) {
    await unlink(destination).catch(() => {});
    if (cause instanceof MediaFetchError || cause instanceof MediaUnavailableError) throw cause;
    throw new MediaFetchError(`Failed writing media to disk: ${(cause as Error).message}`);
  }

  if (bytes === 0) {
    await unlink(destination).catch(() => {});
    throw new MediaUnavailableError("The CDN returned an empty body");
  }
}

function classifyYtDlpFailure(cause: unknown): Error {
  const error = cause as NodeJS.ErrnoException & { stderr?: string };

  if (error.code === "ENOENT") {
    return new MediaFetchError(
      "yt-dlp is not installed, so pasted permalinks cannot be resolved. Forwarding the reel works without it.",
    );
  }

  const stderr = error.stderr ?? error.message ?? "";
  const permanent = [
    "empty media response",
    "requested content is not available",
    "this post is private",
    "video unavailable",
    "http error 404",
    "http error 410",
    "removed",
  ];
  if (permanent.some((needle) => stderr.toLowerCase().includes(needle))) {
    return new MediaUnavailableError(`Instagram will not serve this reel: ${stderr.trim().slice(0, 500)}`);
  }

  if (stderr.toLowerCase().includes("login required") || stderr.toLowerCase().includes("rate-limit")) {
    return new MediaFetchError(`Instagram is refusing anonymous access right now: ${stderr.trim().slice(0, 500)}`);
  }

  return new MediaFetchError(`yt-dlp failed: ${stderr.trim().slice(0, 500)}`);
}

async function ytDlpMetadata(url: string): Promise<FetchedMetadata> {
  const { stdout } = await run("yt-dlp", ["-J", "--no-warnings", "--no-playlist", url], {
    maxBuffer: MAX_STDOUT,
  });

  const info = JSON.parse(stdout) as Record<string, unknown>;
  const uploader = (info.uploader_id ?? info.uploader ?? info.channel) as string | undefined;

  return {
    caption: typeof info.description === "string" ? info.description : null,
    creatorUsername: uploader ? uploader.replace(/^@/, "") : null,
    permalink: typeof info.webpage_url === "string" ? info.webpage_url : null,
    shortcode: (info.display_id ?? info.id) as string | null,
  };
}

async function ytDlpDownload(url: string, destination: string): Promise<void> {
  await run(
    "yt-dlp",
    [
      "--no-warnings",
      "--no-playlist",
      "--no-progress",
      "-f",
      "best[ext=mp4]/bv*+ba/best",
      "--merge-output-format",
      "mp4",
      "-o",
      destination,
      url,
    ],
    { maxBuffer: MAX_STDOUT },
  );
}

/**
 * Turns an intake reference into an mp4 on the volume, returning whatever metadata the
 * route happened to expose. Forwarded reels yield no metadata; pasted permalinks yield
 * caption, creator and a durable link.
 */
export async function resolveMedia(intakeRef: string, destinationRelative: string): Promise<FetchedMetadata> {
  const destination = absolutePath(destinationRelative);

  if (intakeRef.startsWith("local:")) {
    const source = absolutePath(intakeRef.slice("local:".length));
    try {
      await rename(source, destination);
    } catch (cause) {
      throw new MediaUnavailableError(`Uploaded file is missing: ${(cause as Error).message}`);
    }
    return NO_METADATA;
  }

  if (isLookasideUrl(intakeRef)) {
    await downloadUrlToFile(intakeRef, destination);
    return NO_METADATA;
  }

  const parsed = parseInstagramUrl(intakeRef);
  if (!parsed) {
    throw new MediaUnavailableError(`Not a recognisable Instagram URL: ${intakeRef}`);
  }

  // Metadata is a bonus, so a failure here must not mask a perfectly good download.
  const metadata = await ytDlpMetadata(parsed.url).catch(() => NO_METADATA);

  try {
    await ytDlpDownload(parsed.url, destination);
  } catch (cause) {
    await unlink(destination).catch(() => {});
    throw classifyYtDlpFailure(cause);
  }

  const { size } = await stat(destination).catch(() => ({ size: 0 }));
  if (size === 0) {
    await unlink(destination).catch(() => {});
    throw new MediaUnavailableError("yt-dlp produced an empty file");
  }

  return metadata;
}
