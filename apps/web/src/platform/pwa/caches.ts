/** Deletes what the service worker stored (on logout: nothing of a session may outlive it). */
export async function clearAppCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  } catch {
    // storage blocked or unavailable: nothing to clear
  }
}
