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
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processNewSites(env));
  },
} satisfies ExportedHandler<Env>;
