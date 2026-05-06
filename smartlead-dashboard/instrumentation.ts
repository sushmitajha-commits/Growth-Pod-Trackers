/**
 * Fires once when the Next.js server starts.
 * Kicks off /api/prewarm in the background so historical months are cached
 * to disk before the user opens the dashboard.
 *
 * Requires `experimental.instrumentationHook = true` in next.config.js (Next 14).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_PREWARM === "1") return;

  const port = process.env.PORT || "3000";
  const url = `http://localhost:${port}/api/prewarm`;

  setTimeout(async () => {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          // eslint-disable-next-line no-console
          console.log(`[prewarm] done — ${json.summary?.ok}/${json.summary?.total} ok in ${json.summary?.total_ms}ms`);
          return;
        }
      } catch {
        // server not ready yet
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    // eslint-disable-next-line no-console
    console.warn("[prewarm] timed out waiting for server");
  }, 1000);
}
