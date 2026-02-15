import { queryUnprocessedPages, uploadAndAttachScreenshot, updatePageDetails } from "./notion";
import { takeScreenshot } from "./screenshot";
import { generateDescription } from "./describe";
import { shouldProcess, recordFailure, clearFailure, recordScreenshot, needsRefresh } from "./retry";

export interface Env {
  MYBROWSER: Fetcher;
  AI: Ai;
  RETRY_STORE: KVNamespace;
  NOTION_API_KEY: string;
  NOTION_DATABASE_ID: string;
}

// Browser Rendering limit: 3 new instances per minute.
// 25s delay between pages keeps us safely under the cap.
const DELAY_BETWEEN_PAGES_MS = 25_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processSites(env: Env): Promise<void> {
  const allPages = await queryUnprocessedPages(env.NOTION_DATABASE_ID, env.NOTION_API_KEY);

  // Split into new pages (no preview) and candidates for refresh
  const newPages = allPages.filter((p) => !p.hasPreview);
  const refreshCandidates: typeof allPages = [];
  for (const page of allPages) {
    if (page.hasPreview && (await needsRefresh(env.RETRY_STORE, page.id))) {
      refreshCandidates.push(page);
    }
  }

  const toProcess = [...newPages, ...refreshCandidates];
  console.log(
    `Found ${newPages.length} new, ${refreshCandidates.length} stale — ${toProcess.length} to process`
  );

  let processed = 0;
  for (const page of toProcess) {
    if (!(await shouldProcess(env.RETRY_STORE, page.id))) {
      console.log(`Skipping ${page.url} — max retries reached`);
      continue;
    }

    // Rate limit: wait between browser sessions (skip delay for first page)
    if (processed > 0) {
      console.log(`Waiting ${DELAY_BETWEEN_PAGES_MS / 1000}s (rate limit)...`);
      await delay(DELAY_BETWEEN_PAGES_MS);
    }

    try {
      const isRefresh = page.hasPreview;
      console.log(`${isRefresh ? "Refreshing" : "Processing"}: ${page.url}`);

      const { screenshot, title, metaDescription } = await takeScreenshot(
        env.MYBROWSER,
        page.url
      );

      // Only generate AI description if one doesn't already exist
      const description = page.description || await generateDescription(
        env.AI,
        title,
        metaDescription,
        page.url
      );

      const name = page.name || title || new URL(page.url).hostname;

      await uploadAndAttachScreenshot(page.id, screenshot, env.NOTION_API_KEY);
      if (!isRefresh) {
        await updatePageDetails(page.id, name, description, env.NOTION_API_KEY);
      }
      await recordScreenshot(env.RETRY_STORE, page.id);
      await clearFailure(env.RETRY_STORE, page.id);

      console.log(`Done: ${page.url}`);
      processed++;
    } catch (err) {
      console.error(`Failed to process ${page.url}:`, err);
      await recordFailure(env.RETRY_STORE, page.id);
      processed++;
    }
  }
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processSites(env));
  },
} satisfies ExportedHandler<Env>;
