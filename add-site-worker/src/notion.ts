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
