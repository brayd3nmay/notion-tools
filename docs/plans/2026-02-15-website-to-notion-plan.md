# Website-to-Notion Automation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Cloudflare Worker that auto-processes new entries in the "Websites I Like" Notion database — screenshots, AI descriptions, and file uploads.

**Architecture:** Cron-triggered Worker polls Notion for unprocessed entries (URL set, Description empty), takes screenshots via Browser Rendering, generates descriptions via Workers AI, uploads everything back via Notion's file upload API. Retry failures tracked in KV (max 3 attempts).

**Tech Stack:** Cloudflare Workers, @cloudflare/puppeteer, Workers AI (@cf/meta/llama-3.1-8b-instruct), Notion API v2022-06-28, TypeScript, Vitest

---

### Task 1: Scaffold the Worker project

**Files:**
- Create: `add-site-worker/package.json`
- Create: `add-site-worker/tsconfig.json`
- Create: `add-site-worker/wrangler.toml`
- Create: `add-site-worker/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "add-site-worker",
  "private": true,
  "scripts": {
    "dev": "wrangler dev --remote",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "dependencies": {
    "@cloudflare/puppeteer": "^0.0.16"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8.0",
    "@cloudflare/workers-types": "^4.20250214.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "wrangler": "^4.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

**Step 3: Create wrangler.toml**

Note: The `kv_namespaces` ID will need to be filled after running `wrangler kv namespace create`. Use a placeholder for now.

```toml
name = "add-site-worker"
main = "src/index.ts"
compatibility_date = "2025-03-14"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["*/5 * * * *"]

[browser]
binding = "MYBROWSER"

[ai]
binding = "AI"

[vars]
NOTION_DATABASE_ID = "30a6302d-6df1-4752-87cd-34eee3db74c2"

[[kv_namespaces]]
binding = "RETRY_STORE"
id = "PLACEHOLDER_KV_ID"

# Secret: NOTION_API_KEY — set via `wrangler secret put NOTION_API_KEY`
```

**Step 4: Create minimal src/index.ts**

```typescript
export interface Env {
  MYBROWSER: Fetcher;
  AI: Ai;
  RETRY_STORE: KVNamespace;
  NOTION_API_KEY: string;
  NOTION_DATABASE_ID: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Cron triggered — processing new sites...");
  },
} satisfies ExportedHandler<Env>;
```

**Step 5: Install dependencies**

Run: `cd add-site-worker && npm install`
Expected: Clean install, no errors.

**Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 7: Commit**

```bash
git add add-site-worker/
git commit -m "feat: scaffold add-site-worker project"
```

---

### Task 2: Implement Notion API client — query unprocessed pages

**Files:**
- Create: `add-site-worker/src/notion.ts`
- Create: `add-site-worker/test/notion.test.ts`

**Context:** The Notion API uses POST `/v1/databases/{id}/query` with a filter to find pages where URL is not empty AND Description is empty. The response contains page objects with properties.

Reference: Notion API version `2022-06-28`. Database ID: `30a6302d-6df1-4752-87cd-34eee3db74c2`.

**Step 1: Write the failing test**

Create `add-site-worker/test/notion.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { queryUnprocessedPages, type NotionPage } from "../src/notion";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("queryUnprocessedPages", () => {
  it("returns pages with URL set and Description empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "page-1",
            properties: {
              Name: { title: [{ plain_text: "" }] },
              URL: { url: "https://example.com" },
              Description: { rich_text: [] },
            },
          },
        ],
        has_more: false,
      }),
    });

    const pages = await queryUnprocessedPages("fake-db-id", "fake-token");

    expect(pages).toHaveLength(1);
    expect(pages[0].id).toBe("page-1");
    expect(pages[0].url).toBe("https://example.com");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.notion.com/v1/databases/fake-db-id/query",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer fake-token",
        }),
      })
    );
  });
});
```

**Step 2: Create vitest.config.ts**

Create `add-site-worker/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

**Step 3: Run test to verify it fails**

Run: `cd add-site-worker && npx vitest run`
Expected: FAIL — `notion` module doesn't exist yet.

**Step 4: Implement queryUnprocessedPages**

Create `add-site-worker/src/notion.ts`:

```typescript
export interface NotionPage {
  id: string;
  url: string;
  name: string;
}

export async function queryUnprocessedPages(
  databaseId: string,
  apiKey: string
): Promise<NotionPage[]> {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "URL", url: { is_not_empty: true } },
            { property: "Description", rich_text: { is_empty: true } },
          ],
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    results: Array<{
      id: string;
      properties: {
        Name: { title: Array<{ plain_text: string }> };
        URL: { url: string };
      };
    }>;
  };

  return data.results.map((page) => ({
    id: page.id,
    url: page.properties.URL.url,
    name: page.properties.Name.title[0]?.plain_text ?? "",
  }));
}
```

**Step 5: Run test to verify it passes**

Run: `cd add-site-worker && npx vitest run`
Expected: PASS

**Step 6: Commit**

```bash
git add add-site-worker/src/notion.ts add-site-worker/test/notion.test.ts add-site-worker/vitest.config.ts
git commit -m "feat: add Notion API client for querying unprocessed pages"
```

---

### Task 3: Implement Notion file upload + page update

**Files:**
- Modify: `add-site-worker/src/notion.ts`
- Modify: `add-site-worker/test/notion.test.ts`

**Context:** Uploading a file to Notion is a 3-step process:
1. `POST /v1/file_uploads` — create a file upload container (returns `id` and `upload_url`)
2. `POST /v1/file_uploads/{id}/send` — send the binary content as multipart/form-data
3. `PATCH /v1/pages/{page_id}` — attach the file_upload to the Preview property

**Step 1: Write the failing test for uploadAndAttachScreenshot**

Add to `add-site-worker/test/notion.test.ts`:

```typescript
import { uploadAndAttachScreenshot } from "../src/notion";

describe("uploadAndAttachScreenshot", () => {
  it("creates file upload, sends content, and updates page", async () => {
    // Step 1: create file upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "file-upload-123",
        upload_url: "https://api.notion.com/v1/file_uploads/file-upload-123/send",
      }),
    });
    // Step 2: send file content
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "uploaded" }),
    });
    // Step 3: update page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "page-1" }),
    });

    const screenshot = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // fake PNG header
    await uploadAndAttachScreenshot("page-1", screenshot, "fake-token");

    // Verify 3 fetch calls were made
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify file upload creation
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.notion.com/v1/file_uploads");

    // Verify file content send
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://api.notion.com/v1/file_uploads/file-upload-123/send"
    );

    // Verify page update
    expect(mockFetch.mock.calls[2][0]).toBe("https://api.notion.com/v1/pages/page-1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd add-site-worker && npx vitest run`
Expected: FAIL — `uploadAndAttachScreenshot` not exported.

**Step 3: Implement uploadAndAttachScreenshot**

Add to `add-site-worker/src/notion.ts`:

```typescript
export async function uploadAndAttachScreenshot(
  pageId: string,
  screenshot: Uint8Array,
  apiKey: string
): Promise<void> {
  // Step 1: Create file upload
  const createRes = await fetch("https://api.notion.com/v1/file_uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "single_part",
      filename: `screenshot-${pageId}.jpg`,
      content_type: "image/jpeg",
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create file upload: ${createRes.status}`);
  }

  const { id: fileUploadId } = (await createRes.json()) as { id: string };

  // Step 2: Send file content
  const formData = new FormData();
  const blob = new Blob([screenshot], { type: "image/jpeg" });
  formData.append("file", blob, `screenshot-${pageId}.jpg`);

  const sendRes = await fetch(
    `https://api.notion.com/v1/file_uploads/${fileUploadId}/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
      },
      body: formData,
    }
  );

  if (!sendRes.ok) {
    throw new Error(`Failed to send file content: ${sendRes.status}`);
  }

  // Step 3: Update page with file attachment
  const updateRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        Preview: {
          files: [
            {
              type: "file_upload",
              file_upload: { id: fileUploadId },
              name: `screenshot-${pageId}.jpg`,
            },
          ],
        },
      },
    }),
  });

  if (!updateRes.ok) {
    throw new Error(`Failed to update page: ${updateRes.status}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd add-site-worker && npx vitest run`
Expected: PASS

**Step 5: Add updatePageDetails function**

Also add to `add-site-worker/src/notion.ts`:

```typescript
export async function updatePageDetails(
  pageId: string,
  name: string,
  description: string,
  apiKey: string
): Promise<void> {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        Name: { title: [{ text: { content: name } }] },
        Description: { rich_text: [{ text: { content: description } }] },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update page details: ${response.status}`);
  }
}
```

**Step 6: Commit**

```bash
git add add-site-worker/src/notion.ts add-site-worker/test/notion.test.ts
git commit -m "feat: add Notion file upload and page update functions"
```

---

### Task 4: Implement screenshot module

**Files:**
- Create: `add-site-worker/src/screenshot.ts`

**Context:** Uses `@cloudflare/puppeteer` to launch a browser via the `MYBROWSER` binding, navigate to the URL, extract metadata, and take a viewport screenshot. This cannot be unit tested locally — requires `wrangler dev --remote`.

**Step 1: Implement takeScreenshot**

Create `add-site-worker/src/screenshot.ts`:

```typescript
import puppeteer from "@cloudflare/puppeteer";

export interface ScreenshotResult {
  screenshot: Uint8Array;
  title: string;
  metaDescription: string;
}

export async function takeScreenshot(
  browserBinding: Fetcher,
  url: string
): Promise<ScreenshotResult> {
  const browser = await puppeteer.launch(browserBinding);
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });

  const title = await page.title();

  const metaDescription = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="description"]');
    return meta?.getAttribute("content") ?? "";
  });

  const screenshotBuffer = await page.screenshot({
    type: "jpeg",
    quality: 85,
  });

  await browser.close();

  return {
    screenshot: new Uint8Array(screenshotBuffer),
    title,
    metaDescription,
  };
}
```

**Step 2: Commit**

```bash
git add add-site-worker/src/screenshot.ts
git commit -m "feat: add browser screenshot module"
```

---

### Task 5: Implement AI description generation

**Files:**
- Create: `add-site-worker/src/describe.ts`

**Context:** Uses Workers AI binding with `@cf/meta/llama-3.1-8b-instruct` to generate a concise description from the page title and meta description. Also cannot be unit tested locally.

**Step 1: Implement generateDescription**

Create `add-site-worker/src/describe.ts`:

```typescript
export async function generateDescription(
  ai: Ai,
  title: string,
  metaDescription: string,
  url: string
): Promise<string> {
  const prompt = `You are describing a website for a design inspiration gallery. Given the following information about a website, write a concise 1-2 sentence description of what the site is and why it's visually interesting.

Title: ${title}
Meta description: ${metaDescription}
URL: ${url}

Respond with only the description, no preamble.`;

  const result = (await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    prompt,
    max_tokens: 150,
  })) as { response: string };

  return result.response.trim();
}
```

**Step 2: Commit**

```bash
git add add-site-worker/src/describe.ts
git commit -m "feat: add AI description generation module"
```

---

### Task 6: Implement retry logic

**Files:**
- Create: `add-site-worker/src/retry.ts`
- Create: `add-site-worker/test/retry.test.ts`

**Step 1: Write the failing tests**

Create `add-site-worker/test/retry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shouldProcess, recordFailure, clearFailure, MAX_RETRIES } from "../src/retry";

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
```

**Step 2: Run test to verify it fails**

Run: `cd add-site-worker && npx vitest run`
Expected: FAIL — `retry` module doesn't exist.

**Step 3: Implement retry module**

Create `add-site-worker/src/retry.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd add-site-worker && npx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add add-site-worker/src/retry.ts add-site-worker/test/retry.test.ts
git commit -m "feat: add KV-based retry tracking (max 3 attempts)"
```

---

### Task 7: Wire everything together in the cron handler

**Files:**
- Modify: `add-site-worker/src/index.ts`

**Step 1: Implement the full scheduled handler**

Replace `add-site-worker/src/index.ts`:

```typescript
import { queryUnprocessedPages, uploadAndAttachScreenshot, updatePageDetails } from "./notion";
import { takeScreenshot } from "./screenshot";
import { generateDescription } from "./describe";
import { shouldProcess, recordFailure, clearFailure } from "./retry";

export interface Env {
  MYBROWSER: Fetcher;
  AI: Ai;
  RETRY_STORE: KVNamespace;
  NOTION_API_KEY: string;
  NOTION_DATABASE_ID: string;
}

async function processNewSites(env: Env): Promise<void> {
  const pages = await queryUnprocessedPages(env.NOTION_DATABASE_ID, env.NOTION_API_KEY);
  console.log(`Found ${pages.length} unprocessed page(s)`);

  for (const page of pages) {
    if (!(await shouldProcess(env.RETRY_STORE, page.id))) {
      console.log(`Skipping ${page.url} — max retries reached`);
      continue;
    }

    try {
      console.log(`Processing: ${page.url}`);

      const { screenshot, title, metaDescription } = await takeScreenshot(
        env.MYBROWSER,
        page.url
      );

      const description = await generateDescription(
        env.AI,
        title,
        metaDescription,
        page.url
      );

      const name = title || new URL(page.url).hostname;

      await uploadAndAttachScreenshot(page.id, screenshot, env.NOTION_API_KEY);
      await updatePageDetails(page.id, name, description, env.NOTION_API_KEY);
      await clearFailure(env.RETRY_STORE, page.id);

      console.log(`Done: ${page.url}`);
    } catch (err) {
      console.error(`Failed to process ${page.url}:`, err);
      await recordFailure(env.RETRY_STORE, page.id);
    }
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processNewSites(env));
  },
} satisfies ExportedHandler<Env>;
```

**Step 2: Type-check**

Run: `cd add-site-worker && npx tsc --noEmit`
Expected: No type errors.

**Step 3: Run all tests**

Run: `cd add-site-worker && npx vitest run`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add add-site-worker/src/index.ts
git commit -m "feat: wire cron handler with all modules"
```

---

### Task 8: Deploy and integration test

**Files:**
- Modify: `add-site-worker/wrangler.toml` (fill in real KV namespace ID)

**Step 1: Create KV namespace**

Run: `cd add-site-worker && npx wrangler kv namespace create RETRY_STORE`
Expected: Output includes `id = "<some-uuid>"`. Copy this.

**Step 2: Update wrangler.toml with real KV ID**

Replace `PLACEHOLDER_KV_ID` with the actual ID from step 1.

**Step 3: Set the Notion API secret**

Run: `cd add-site-worker && npx wrangler secret put NOTION_API_KEY`
Expected: Prompts for the secret value. Paste your Notion internal integration token.

**Step 4: Deploy**

Run: `cd add-site-worker && npx wrangler deploy`
Expected: Deploys successfully. Cron trigger registered.

**Step 5: Test manually**

1. Add a new row to your "Websites I Like" Notion database with just a URL (e.g., `https://linear.app`)
2. Trigger the cron manually: `cd add-site-worker && npx wrangler triggers run scheduled`
   Or wait up to 5 minutes for the cron to fire.
3. Check the Notion page — Name, Description, and Preview should be populated.

**Step 6: Commit final wrangler.toml**

```bash
git add add-site-worker/wrangler.toml
git commit -m "chore: configure KV namespace for deployment"
```

---

## Prerequisites Checklist

Before starting:

1. **Cloudflare account** with Workers Paid plan (Browser Rendering requires it)
2. **Notion internal integration** created at https://www.notion.so/my-integrations with:
   - Read content capability
   - Update content capability
   - Insert content capability
   - Connected to the "Websites I Like" database
3. **Wrangler authenticated**: `npx wrangler login`
