import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

/** Returns null when ffprobe is unavailable or the container has no readable duration. */
export async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * Grabs a poster frame one second in. Best effort: a missing thumbnail is a cosmetic
 * problem, never a reason to fail ingestion.
 */
export async function extractThumbnail(videoPath: string, outputPath: string): Promise<boolean> {
  try {
    await run("ffmpeg", [
      "-y",
      "-ss",
      "1",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-2",
      "-q:v",
      "4",
      outputPath,
    ]);
    return true;
  } catch {
    // Reels shorter than a second have no frame at ss=1; retry from the very start.
    try {
      await run("ffmpeg", ["-y", "-i", videoPath, "-frames:v", "1", "-vf", "scale=480:-2", outputPath]);
      return true;
    } catch {
      return false;
    }
  }
}
