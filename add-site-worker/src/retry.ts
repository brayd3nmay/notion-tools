export const MAX_RETRIES = 3;
export const REFRESH_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const EXPIRATION_TTL = 60 * 60 * 24 * 30; // 30 days

function failureKey(pageId: string): string {
  return `failures:${pageId}`;
}

function screenshotKey(pageId: string): string {
  return `screenshot:${pageId}`;
}

export async function shouldProcess(
  kv: KVNamespace,
  pageId: string
): Promise<boolean> {
  const count = await kv.get(failureKey(pageId));
  return count === null || parseInt(count, 10) < MAX_RETRIES;
}

export async function recordFailure(
  kv: KVNamespace,
  pageId: string
): Promise<void> {
  const current = await kv.get(failureKey(pageId));
  const count = current === null ? 1 : parseInt(current, 10) + 1;
  await kv.put(failureKey(pageId), count.toString(), {
    expirationTtl: EXPIRATION_TTL,
  });
}

export async function clearFailure(
  kv: KVNamespace,
  pageId: string
): Promise<void> {
  await kv.delete(failureKey(pageId));
}

export async function recordScreenshot(
  kv: KVNamespace,
  pageId: string
): Promise<void> {
  await kv.put(screenshotKey(pageId), Date.now().toString());
}

export async function needsRefresh(
  kv: KVNamespace,
  pageId: string
): Promise<boolean> {
  const timestamp = await kv.get(screenshotKey(pageId));
  if (timestamp === null) return true;
  return Date.now() - parseInt(timestamp, 10) > REFRESH_INTERVAL_MS;
}
