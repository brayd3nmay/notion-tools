export interface NotionPage {
  id: string;
  url: string;
  name: string;
  description: string;
  hasPreview: boolean;
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
          property: "URL",
          url: { is_not_empty: true },
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
        Description: { rich_text: Array<{ plain_text: string }> };
        Preview: { files: Array<unknown> };
      };
    }>;
  };

  return data.results.map((page) => ({
    id: page.id,
    url: page.properties.URL.url,
    name: page.properties.Name.title[0]?.plain_text ?? "",
    description: page.properties.Description.rich_text[0]?.plain_text ?? "",
    hasPreview: page.properties.Preview.files.length > 0,
  }));
}

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
