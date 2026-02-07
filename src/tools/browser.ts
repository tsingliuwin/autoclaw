import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { ToolModule } from './interface.js';

export const BrowserTool: ToolModule = {
  name: "Web Browser",
  configKeys: [],
  definition: {
    type: "function",
    function: {
      name: "read_website",
      description: "Reads and extracts the main content from a website URL. Use this to summarize articles or get information from specific pages.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL of the website to read (e.g., https://example.com/article)."
          }
        },
        required: ["url"]
      }
    }
  },
  handler: async (args: any, config: any) => {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error: any) {
      if (error.message.includes("Executable doesn't exist")) {
        return "Error: Playwright browsers are not installed. Please run `npx playwright install chromium` to enable this feature.";
      }
      return `Error launching browser: ${error.message}`;
    }

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    const page = await context.newPage();

    try {
      console.log(`Navigating to ${args.url}...`);
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Get the full HTML content
      const html = await page.content();

      // Use JSDOM to create a virtual DOM for Readability
      const dom = new JSDOM(html, { url: args.url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        // Fallback: just return body text if Readability fails
        const bodyText = await page.innerText('body');
        return `Could not parse article content with Readability. Raw text content:

${bodyText.slice(0, 5000)}... (truncated)`;
      }

      return `Title: ${article.title}

Content:
${(article.textContent || "").trim()}`;

    } catch (error: any) {
      return `Error reading website: ${error.message}`;
    } finally {
      await browser.close();
    }
  }
};
