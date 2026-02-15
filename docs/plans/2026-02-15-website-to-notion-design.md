# Website-to-Notion Automation — Design

## Problem

Adding websites to the "Websites I Like" Notion database is manual. You have to paste the URL, write a name, write a description, and take/upload a screenshot for the gallery preview card.

## Solution

A Cloudflare Worker that automatically processes new entries. Just paste a URL into the Notion database — the Worker fills in everything else.

## Architecture

**Cloudflare Worker + Cron Polling (every 5 minutes)**

```
Cron Trigger (5 min)
    │
    ▼
Query Notion DB for unprocessed entries
(URL set, Description empty, < 3 failures)
    │
    ▼  (for each entry)
Browser Rendering
  • Navigate to URL
  • Extract title + meta description
  • Screenshot viewport (1920×1080)
    │
    ▼
Workers AI
  • Generate 1-2 sentence description from page content
    │
    ▼
Notion API
  • Upload screenshot via file_uploads API
  • Update page: Name, Description, Preview
```

## Data Flow

1. User pastes a URL into a new row in the "Websites I Like" database
2. Cron fires every 5 minutes
3. Worker queries Notion for pages where `URL` is set but `Description` is empty
4. For each unprocessed page:
   - **Browser Rendering**: Opens the URL, waits for load, extracts `<title>` and `<meta name="description">`, takes a 1920×1080 screenshot
   - **Workers AI**: Generates a concise description from the extracted text
   - **Notion File Upload API**: Creates a file upload, sends screenshot binary, gets `file_upload_id`
   - **Notion Update Page API**: Sets `Name`, `Description`, and `Preview`

## Notion Database Schema

- **Name** (title): Website name — populated from `<title>` tag
- **URL** (url): The website link — user-provided
- **Description** (text): Short description — AI-generated
- **Preview** (file): Screenshot — uploaded via file_uploads API

Database ID: `30a6302d-6df1-4752-87cd-34eee3db74c2`
Data source ID: `335b8d1a-c6b1-4ac9-a090-889702aeb4b5`

## Retry Logic

- Failures tracked in **Cloudflare KV** (`RETRY_STORE`), keyed by Notion page ID
- On failure: increment `failures:{page_id}`
- Before processing: check `failures:{page_id} >= 3` → skip
- On success: delete the failure key
- KV entries expire after 30 days (auto-cleanup)

## Worker Bindings (wrangler.toml)

| Binding          | Type              | Purpose                        |
|------------------|-------------------|--------------------------------|
| `MYBROWSER`      | Browser Rendering | Headless browser for screenshots |
| `AI`             | Workers AI        | Description generation          |
| `RETRY_STORE`    | KV Namespace      | Failure count tracking          |
| `NOTION_API_KEY` | Secret            | Notion integration token        |
| `NOTION_DATABASE_ID` | Var          | Target database ID              |

## Project Structure

```
notion-tools/
├── add-site-worker/
│   ├── src/
│   │   └── index.ts
│   ├── wrangler.toml
│   ├── package.json
│   └── tsconfig.json
└── docs/
    └── plans/
```

## Decisions

- **Cron over webhooks**: Simpler, no Notion automation fragility
- **KV for retry tracking**: Avoids polluting Notion schema with status fields
- **Workers AI for descriptions**: Keeps everything Cloudflare-native, no external API keys
- **1920×1080 viewport**: Standard desktop resolution for clean hero screenshots
- **"Unprocessed" = URL set + Description empty**: Simple, no extra status property needed
