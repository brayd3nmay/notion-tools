export const MAX_RETRIES = 3;
const EXPIRATION_TTL = 60 * 60 * 24 * 30; // 30 days

function key(pageId: string): string {
  return `failures:${pageId}`;
}

export async function shouldProcess(
  kv: KVNamespace,
  pageId: string
): Promise<boolean> {
  const count = await kv.get(key(pageId));
  return count === null || parseInt(count, 10) < MAX_RETRIES;
}

export async function recordFailure(
  kv: KVNamespace,
  pageId: string
): Promise<void> {
  const current = await kv.get(key(pageId));
  const count = current === null ? 1 : parseInt(current, 10) + 1;
  await kv.put(key(pageId), count.toString(), {
    expirationTtl: EXPIRATION_TTL,
  });
}

export async function clearFailure(
  kv: KVNamespace,
  pageId: string
): Promise<void> {
  await kv.delete(key(pageId));
}
