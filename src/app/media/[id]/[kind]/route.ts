import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { isAuthenticated } from "@/lib/auth";
import { sql } from "@/lib/db";
import { absolutePath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toWebStream(nodeStream: ReturnType<typeof createReadStream>): ReadableStream {
  return Readable.toWeb(nodeStream) as ReadableStream;
}

/** Serves reel media off the volume, gated behind the dashboard session. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
): Promise<Response> {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, kind } = await params;
  if (!UUID.test(id) || (kind !== "video" && kind !== "thumb")) {
    return new Response("Not found", { status: 404 });
  }

  const [reel] = await sql<{ video_path: string | null; thumbnail_path: string | null }[]>`
    select video_path, thumbnail_path from reels where id = ${id}
  `;

  const relative = kind === "video" ? reel?.video_path : reel?.thumbnail_path;
  if (!relative) {
    return new Response("Not found", { status: 404 });
  }

  const absolute = absolutePath(relative);
  let size: number;
  try {
    ({ size } = await stat(absolute));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const contentType = kind === "video" ? "video/mp4" : "image/jpeg";
  const baseHeaders = {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  };

  // Range support keeps scrubbing responsive in the video player.
  const range = request.headers.get("range");
  const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;

  if (match) {
    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const cappedEnd = Math.min(end, size - 1);
    return new Response(toWebStream(createReadStream(absolute, { start, end: cappedEnd })), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${cappedEnd}/${size}`,
        "Content-Length": String(cappedEnd - start + 1),
      },
    });
  }

  return new Response(toWebStream(createReadStream(absolute)), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
