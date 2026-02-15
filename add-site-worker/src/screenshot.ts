import puppeteer from "@cloudflare/puppeteer";

export interface ScreenshotResult {
  screenshot: Uint8Array;
  title: string;
  metaDescription: string;
}

export async function takeScreenshot(
  browserBinding: Fetcher,
  url: string
): Promise<ScreenshotResult> {
  const browser = await puppeteer.launch(browserBinding);
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });

  const title = await page.title();

  const metaDescription = (await page.evaluate(
    `document.querySelector('meta[name="description"]')?.getAttribute("content") ?? ""`
  )) as string;

  const screenshotBuffer = await page.screenshot({
    type: "jpeg",
    quality: 85,
  });

  await browser.close();

  return {
    screenshot: new Uint8Array(screenshotBuffer),
    title,
    metaDescription,
  };
}
