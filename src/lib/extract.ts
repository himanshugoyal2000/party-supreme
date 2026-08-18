import { readFile, stat } from "node:fs/promises";
import { GoogleGenAI, MediaResolution, Type } from "@google/genai";
import { env } from "./env";
import { absolutePath } from "./storage";
import type { NoteMention, PlaceMention, PriceMention } from "./types";

/** Bump when the prompt or schema changes; results are stored per version, never overwritten. */
export const EXTRACTOR_VERSION = "v1";

/** Base64 inflates by a third, and the inline request limit is 100MB. */
const MAX_INLINE_BYTES = 60 * 1024 * 1024;

const PROMPT = `You are a faithful transcription and extraction tool building a private travel knowledge base from Instagram Reels. You are given a reel, and sometimes its caption.

Record ONLY what the reel explicitly says or shows. This is an archival record, not a review.

Rules:
- Never infer, guess, rank, rate, score or embellish.
- Never add anything you happen to know about a place from outside this reel.
- If something is unclear or inaudible, omit it rather than guessing at it.
- Never turn a specific statement into a general claim. If the reel says "this rooftop bar has an amazing sunset view", record exactly that. Do not record "this is the best rooftop bar in Bangkok".
- transcript: verbatim speech in its original language. Empty string if nobody speaks.
- on_screen_text: text visible in the video, such as burned-in captions, signs, menus, price cards and place names. One item per line. Empty string if there is none.
- visual_description: two or three plain factual sentences describing what is shown. Describe, do not evaluate.
- places: every place, venue, area or experience named. Use a short factual label for kind, such as restaurant, club, bar, beach, hotel, market, viewpoint, activity or area. Use an empty string for kind or location when the reel does not make it clear.
- prices: every price or cost mentioned. Put the amount exactly as stated, including its currency, in amount_text.
- tips: practical advice the reel actually gives.
- warnings: warnings, restrictions or cautions the reel actually gives.
- Every place, price, tip and warning must carry verbatim_context: the exact words from the reel, whether spoken, on screen or in the caption, that support it.`;

const mention = (properties: Record<string, { type: Type; description?: string }>) => ({
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties,
    required: Object.keys(properties),
  },
});

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    language: {
      type: Type.STRING,
      description: "Language code of the speech, or an empty string when there is no speech",
    },
    has_speech: { type: Type.BOOLEAN },
    transcript: { type: Type.STRING },
    on_screen_text: { type: Type.STRING },
    visual_description: { type: Type.STRING },
    places: mention({
      name: { type: Type.STRING },
      kind: { type: Type.STRING },
      location: { type: Type.STRING },
      verbatim_context: { type: Type.STRING },
    }),
    prices: mention({
      item: { type: Type.STRING },
      amount_text: { type: Type.STRING },
      verbatim_context: { type: Type.STRING },
    }),
    tips: mention({
      text: { type: Type.STRING },
      verbatim_context: { type: Type.STRING },
    }),
    warnings: mention({
      text: { type: Type.STRING },
      verbatim_context: { type: Type.STRING },
    }),
  },
  required: [
    "language",
    "has_speech",
    "transcript",
    "on_screen_text",
    "visual_description",
    "places",
    "prices",
    "tips",
    "warnings",
  ],
};

export class ExtractionError extends Error {
  override name = "ExtractionError";
}

export interface Extraction {
  language: string | null;
  hasSpeech: boolean;
  transcript: string | null;
  onScreenText: string | null;
  visualDescription: string | null;
  places: PlaceMention[];
  prices: PriceMention[];
  tips: NoteMention[];
  warnings: NoteMention[];
}

export interface ExtractionOutcome {
  extraction: Extraction;
  raw: unknown;
  model: string;
}

const blank = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

function normalize(payload: Record<string, unknown>): Extraction {
  const list = <T>(value: unknown, map: (item: Record<string, unknown>) => T): T[] =>
    Array.isArray(value) ? value.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null).map(map) : [];

  return {
    language: blank(payload.language),
    hasSpeech: payload.has_speech === true,
    transcript: blank(payload.transcript),
    onScreenText: blank(payload.on_screen_text),
    visualDescription: blank(payload.visual_description),
    places: list(payload.places, (p) => ({
      name: String(p.name ?? "").trim(),
      kind: blank(p.kind),
      location: blank(p.location),
      verbatim_context: String(p.verbatim_context ?? "").trim(),
    })).filter((p) => p.name.length > 0),
    prices: list(payload.prices, (p) => ({
      item: String(p.item ?? "").trim(),
      amount_text: String(p.amount_text ?? "").trim(),
      verbatim_context: String(p.verbatim_context ?? "").trim(),
    })).filter((p) => p.amount_text.length > 0),
    tips: list(payload.tips, (t) => ({
      text: String(t.text ?? "").trim(),
      verbatim_context: String(t.verbatim_context ?? "").trim(),
    })).filter((t) => t.text.length > 0),
    warnings: list(payload.warnings, (w) => ({
      text: String(w.text ?? "").trim(),
      verbatim_context: String(w.verbatim_context ?? "").trim(),
    })).filter((w) => w.text.length > 0),
  };
}

let client: GoogleGenAI | undefined;

function genai(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env().GEMINI_API_KEY });
  return client;
}

/**
 * One call does transcription, on-screen text reading and extraction together, because
 * Gemini reads the audio and the frames natively.
 */
export async function extractFromVideo(
  videoRelativePath: string,
  caption: string | null,
): Promise<ExtractionOutcome> {
  const absolute = absolutePath(videoRelativePath);
  const { size } = await stat(absolute);

  if (size > MAX_INLINE_BYTES) {
    throw new ExtractionError(
      `Video is ${(size / 1024 / 1024).toFixed(1)}MB, above the ${MAX_INLINE_BYTES / 1024 / 1024}MB inline limit`,
    );
  }

  const model = env().GEMINI_MODEL;
  const parts: Array<Record<string, unknown>> = [
    { inlineData: { mimeType: "video/mp4", data: (await readFile(absolute)).toString("base64") } },
    { text: PROMPT },
  ];

  if (caption && caption.trim()) {
    parts.push({ text: `The reel's caption, as posted:\n${caption.trim()}` });
  }

  const response = await genai().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) {
    throw new ExtractionError(`${model} returned no content (finish reason: ${response.candidates?.[0]?.finishReason ?? "unknown"})`);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;
  } catch (cause) {
    throw new ExtractionError(`${model} returned unparseable JSON: ${(cause as Error).message}`);
  }

  return { extraction: normalize(payload), raw: payload, model };
}
