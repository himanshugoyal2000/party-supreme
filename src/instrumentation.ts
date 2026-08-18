/**
 * Runs once when the server process boots. The deployment is a single instance, so the
 * worker lives in-process: no cron service, no second container, and no serverless
 * execution time limit to fight when a reel takes a minute to download and extract.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { startWorker } = await import("./lib/worker");
    await startWorker();
  } catch (error) {
    console.error("[instrumentation] failed to start worker:", error);
  }
}
