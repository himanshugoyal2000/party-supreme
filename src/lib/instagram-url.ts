export interface ParsedInstagramUrl {
  url: string;
  /** Null for /share/ links, which are opaque redirects that carry no shortcode. */
  shortcode: string | null;
}

const SHORTCODE_PATH = /\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/;

export function isLookasideUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("lookaside.fbsbx.com");
  } catch {
    return false;
  }
}

export function parseInstagramUrl(input: string): ParsedInstagramUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!/(^|\.)instagram\.com$/.test(parsed.hostname)) return null;

  const match = SHORTCODE_PATH.exec(parsed.pathname);
  const shortcode = match ? match[1] : null;

  // Drop tracking parameters so the same reel pasted from two devices dedupes cleanly.
  const canonical = shortcode
    ? `https://www.instagram.com/reel/${shortcode}/`
    : `${parsed.origin}${parsed.pathname}`;

  return { url: canonical, shortcode };
}

/** Pulls every Instagram link out of a blob of pasted text, preserving order. */
export function extractInstagramUrls(text: string): ParsedInstagramUrl[] {
  const found: ParsedInstagramUrl[] = [];
  const seen = new Set<string>();

  for (const candidate of text.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
    const parsed = parseInstagramUrl(candidate);
    if (!parsed) continue;
    const key = parsed.shortcode ?? parsed.url;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(parsed);
  }

  return found;
}

/**
 * Parses one pasted line, which may optionally be prefixed with who shared the reel:
 *   "Rahul: https://instagram.com/reel/abc123/"
 */
export function parsePastedLine(line: string): { sharedBy: string | null; url: ParsedInstagramUrl } | null {
  const urls = extractInstagramUrls(line);
  if (urls.length === 0) return null;

  const before = line.slice(0, line.indexOf("http")).trim();
  const sharedBy = before.replace(/[:\-–—]\s*$/, "").trim() || null;

  return { sharedBy, url: urls[0] };
}
