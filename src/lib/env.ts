import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),

  DASHBOARD_PASSWORD: z.string().min(1, "DASHBOARD_PASSWORD is required"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),

  DATA_DIR: z.string().default("/data"),

  WORKER_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false" && v !== "0"),
  MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Only needed once the Meta webhook phase is live.
  IG_APP_SECRET: z.string().optional(),
  IG_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  IG_ACCESS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validated at first use rather than at import, so `next build` does not need
 * production secrets present.
 */
export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}
