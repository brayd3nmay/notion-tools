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
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining(
          JSON.stringify({
            filter: {
              and: [
                { property: "URL", url: { is_not_empty: true } },
                { property: "Description", rich_text: { is_empty: true } },
              ],
            },
          })
        ),
      })
    );
  });
});
