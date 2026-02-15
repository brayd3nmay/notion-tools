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

  const result = await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    prompt,
    max_tokens: 150,
  });

  return (result.response ?? "").trim();
}
