import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  shouldProcess, recordFailure, clearFailure, MAX_RETRIES,
  recordScreenshot, needsRefresh, REFRESH_INTERVAL_MS,
} from "../src/retry";

function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    put: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  } as unknown as KVNamespace;
}

describe("retry logic", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createMockKV();
  });

  it("allows processing when no failures recorded", async () => {
    expect(await shouldProcess(kv, "page-1")).toBe(true);
  });

  it("allows processing when failures < MAX_RETRIES", async () => {
    await recordFailure(kv, "page-1");
    await recordFailure(kv, "page-1");
    expect(await shouldProcess(kv, "page-1")).toBe(true);
  });

  it("blocks processing when failures >= MAX_RETRIES", async () => {
    await recordFailure(kv, "page-1");
    await recordFailure(kv, "page-1");
    await recordFailure(kv, "page-1");
    expect(await shouldProcess(kv, "page-1")).toBe(false);
  });

  it("clears failure count on success", async () => {
    await recordFailure(kv, "page-1");
    await recordFailure(kv, "page-1");
    await clearFailure(kv, "page-1");
    expect(await shouldProcess(kv, "page-1")).toBe(true);
  });
});

describe("screenshot refresh", () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createMockKV();
  });

  it("needs refresh when no screenshot recorded", async () => {
    expect(await needsRefresh(kv, "page-1")).toBe(true);
  });

  it("does not need refresh right after recording", async () => {
    await recordScreenshot(kv, "page-1");
    expect(await needsRefresh(kv, "page-1")).toBe(false);
  });

  it("needs refresh after interval has passed", async () => {
    // Record a screenshot timestamp 91 days ago
    const oldTimestamp = Date.now() - (91 * 24 * 60 * 60 * 1000);
    await kv.put("screenshot:page-1", oldTimestamp.toString());
    expect(await needsRefresh(kv, "page-1")).toBe(true);
  });
});
