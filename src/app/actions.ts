"use server";

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, endSession, isAuthenticated, startSession } from "@/lib/auth";
import { parsePastedLine } from "@/lib/instagram-url";
import { recordIntake, requeueReel, setSharedBy } from "@/lib/intake";
import { absolutePath, ensureStorageDirs, tempRelativePath } from "@/lib/storage";

export interface ActionState {
  error?: string;
  message?: string;
}

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const UPLOAD_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

declare global {
  var __tripBrainLoginAttempts: Map<string, { count: number; resetAt: number }> | undefined;
}

async function assertAuthenticated(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/login");
}

async function loginAttemptKey(): Promise<string> {
  const headerList = await headers();
  return (
    headerList.get("fly-client-ip") ??
    headerList.get("x-real-ip") ??
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function attemptsStore(): Map<string, { count: number; resetAt: number }> {
  globalThis.__tripBrainLoginAttempts ??= new Map();
  return globalThis.__tripBrainLoginAttempts;
}

function isLoginRateLimited(key: string): boolean {
  const record = attemptsStore().get(key);
  if (!record) return false;
  if (record.resetAt <= Date.now()) {
    attemptsStore().delete(key);
    return false;
  }
  return record.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedLogin(key: string): void {
  const now = Date.now();
  const store = attemptsStore();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }

  store.set(key, { count: current.count + 1, resetAt: current.resetAt });
}

export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const attemptKey = await loginAttemptKey();

  if (isLoginRateLimited(attemptKey)) {
    return { error: "Too many failed attempts. Try again in a few minutes." };
  }

  if (!password || !checkPassword(password)) {
    recordFailedLogin(attemptKey);
    return { error: "Wrong password." };
  }

  attemptsStore().delete(attemptKey);
  await startSession();
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

/**
 * The manual fallback from PRD 6.9. Accepts one reel link per line, each optionally
 * prefixed with who shared it, for example "Rahul: https://instagram.com/reel/abc/".
 */
export async function submitPastedReels(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await assertAuthenticated();

  const raw = String(formData.get("urls") ?? "");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { error: "Paste at least one reel link." };

  let added = 0;
  let duplicates = 0;
  const unparsed: string[] = [];

  for (const line of lines) {
    const parsed = parsePastedLine(line);
    if (!parsed) {
      unparsed.push(line);
      continue;
    }

    try {
      const result = await recordIntake({
        source: "paste",
        intakeRef: parsed.url.url,
        shortcode: parsed.url.shortcode,
        permalink: parsed.url.url,
        sharedBy: parsed.sharedBy,
        raw: { pastedLine: line },
      });
      if (result.createdReel) added += 1;
      else duplicates += 1;
    } catch (error) {
      unparsed.push(`${line} (${(error as Error).message})`);
    }
  }

  revalidatePath("/");
  revalidatePath("/reels");

  const parts = [`${added} queued`];
  if (duplicates > 0) parts.push(`${duplicates} already known`);
  if (unparsed.length > 0) parts.push(`${unparsed.length} could not be read: ${unparsed.join(", ")}`);

  return { message: parts.join(", ") };
}

/** Last-resort escape hatch for when Instagram will not serve a reel to yt-dlp. */
export async function uploadReel(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await assertAuthenticated();

  const file = formData.get("video");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a video file." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "Video files must be 200MB or smaller." };
  }
  if (file.type && !UPLOAD_MIME_TYPES.has(file.type)) {
    return { error: "Upload an MP4, MOV or WebM video file." };
  }

  await ensureStorageDirs();

  const relative = tempRelativePath(`${randomUUID()}.mp4`);
  await writeFile(absolutePath(relative), Buffer.from(await file.arrayBuffer()));

  const sharedBy = String(formData.get("sharedBy") ?? "").trim() || null;

  await recordIntake({
    source: "upload",
    intakeRef: `local:${relative}`,
    sharedBy,
    raw: { originalFilename: file.name, bytes: file.size },
  });

  revalidatePath("/");
  revalidatePath("/reels");

  return { message: `Queued ${file.name}.` };
}

export async function retryReel(formData: FormData): Promise<void> {
  await assertAuthenticated();

  const reelId = String(formData.get("reelId") ?? "");
  if (!reelId) return;

  await requeueReel(reelId);

  revalidatePath("/");
  revalidatePath("/reels");
  revalidatePath("/failed");
  revalidatePath(`/reels/${reelId}`);
}

/** Recovers the attribution a forwarded reel cannot carry. */
export async function updateSharedBy(formData: FormData): Promise<void> {
  await assertAuthenticated();

  const shareEventId = String(formData.get("shareEventId") ?? "");
  const reelId = String(formData.get("reelId") ?? "");
  if (!shareEventId) return;

  await setSharedBy(shareEventId, String(formData.get("sharedBy") ?? ""));

  revalidatePath("/reels");
  if (reelId) revalidatePath(`/reels/${reelId}`);
}
