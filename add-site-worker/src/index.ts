export interface Env {
  MYBROWSER: Fetcher;
  AI: Ai;
  RETRY_STORE: KVNamespace;
  NOTION_API_KEY: string;
  NOTION_DATABASE_ID: string;
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("Cron triggered — processing new sites...");
  },
} satisfies ExportedHandler<Env>;
