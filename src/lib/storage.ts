import { mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

/**
 * Paths are stored in the database relative to DATA_DIR, so the volume can be
 * remounted or moved without rewriting rows.
 */

export const VIDEO_SUBDIR = "videos";
export const THUMBNAIL_SUBDIR = "thumbnails";
export const TEMP_SUBDIR = "tmp";

export function absolutePath(relative: string): string {
  return path.join(env().DATA_DIR, relative);
}

export function videoRelativePath(reelId: string): string {
  return path.join(VIDEO_SUBDIR, `${reelId}.mp4`);
}

export function thumbnailRelativePath(reelId: string): string {
  return path.join(THUMBNAIL_SUBDIR, `${reelId}.jpg`);
}

export function tempRelativePath(name: string): string {
  return path.join(TEMP_SUBDIR, name);
}

export async function ensureStorageDirs(): Promise<void> {
  for (const dir of [VIDEO_SUBDIR, THUMBNAIL_SUBDIR, TEMP_SUBDIR]) {
    await mkdir(absolutePath(dir), { recursive: true });
  }
}
