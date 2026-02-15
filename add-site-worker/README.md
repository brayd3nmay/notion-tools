# add-site-worker

A Cloudflare Worker that automatically processes websites added to a Notion database. Just paste a URL — the worker fills in the name, description, and a screenshot preview.

## How it works

1. You paste a URL into your Notion "Websites I Like" database
2. A cron trigger fires every 5 minutes
3. The worker finds unprocessed entries and for each one:
   - Takes a 1920x1080 screenshot via [Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-rendering/)
   - Generates a description via [Workers AI](https://developers.cloudflare.com/workers-ai/) (Llama 3.1 8B)
   - Uploads the screenshot to Notion's file upload API
   - Updates the page with the name, description, and preview image
4. Screenshots auto-refresh every 90 days

## Features

- **Fully automated** — paste a URL, wait 5 minutes
- **AI descriptions** — concise 1-2 sentence summaries generated from page content
- **Gallery-ready screenshots** — 1920x1080 JPEG uploaded as Notion file attachments for card covers
- **Rate limiting** — 25s delay between pages to respect Browser Rendering limits (3 instances/min)
- **Retry logic** — failed sites retry up to 3 times, then stop
- **Screenshot refresh** — stale screenshots (>90 days) are automatically retaken
- **Preserves manual edits** — existing names and descriptions are never overwritten

## Notion database schema

| Property | Type | Description |
|----------|------|-------------|
| Name | Title | Website name (auto-filled from `<title>` tag) |
| URL | URL | The website link (you provide this) |
| Description | Text | Short description (AI-generated or manual) |
| Preview | File | Screenshot (uploaded, used as gallery card cover) |

## Setup

**Prerequisites:**
- Cloudflare account with Workers Paid plan ($5/month)
- Notion internal integration with read/update/insert permissions

**Deploy:**

```bash
cd add-site-worker
npm install

# Create KV namespace
npx wrangler kv namespace create RETRY_STORE
# Update wrangler.toml with the KV namespace ID

# Set Notion API secret
npx wrangler secret put NOTION_API_KEY

# Deploy
npx wrangler deploy
```

**Configure:**

Update `wrangler.toml` with your Notion database ID:

```toml
[vars]
NOTION_DATABASE_ID = "your-database-id"
```

## Cost

Everything fits within Cloudflare's included free tiers on the $5/month Workers Paid plan:

| Resource | Free Tier | Typical Usage |
|----------|-----------|---------------|
| Browser Rendering | 10 hours/month | ~20s per site |
| Workers AI | 10,000 neurons/day | ~100 per description |
| Worker requests | 10M/month | ~8,640/month (cron) |
| KV | 100K reads/day | A few per cycle |

## Tech stack

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — serverless runtime
- [@cloudflare/puppeteer](https://developers.cloudflare.com/browser-rendering/) — headless browser screenshots
- [Workers AI](https://developers.cloudflare.com/workers-ai/) — description generation
- [Notion API](https://developers.notion.com/) — database queries, file uploads, page updates
- TypeScript, Vitest
