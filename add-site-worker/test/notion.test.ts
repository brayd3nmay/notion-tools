import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  queryUnprocessedPages,
  uploadAndAttachScreenshot,
  type NotionPage,
} from "../src/notion";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("queryUnprocessedPages", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns pages with URL set and Preview empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "page-1",
            properties: {
              Name: { title: [{ plain_text: "My Site" }] },
              URL: { url: "https://example.com" },
              Description: { rich_text: [{ plain_text: "Existing description" }] },
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
    expect(pages[0].description).toBe("Existing description");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.notion.com/v1/databases/fake-db-id/query",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer fake-token",
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining(
          JSON.stringify({
            filter: {
              and: [
                { property: "URL", url: { is_not_empty: true } },
                { property: "Preview", files: { is_empty: true } },
              ],
            },
          })
        ),
      })
    );
  });
});

describe("uploadAndAttachScreenshot", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

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
