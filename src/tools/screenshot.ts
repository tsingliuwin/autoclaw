import { chromium } from 'playwright';
import { ToolModule } from './interface.js';

export const ScreenshotTool: ToolModule = {
  name: "Screenshot Tool",
  configKeys: [],
  definition: {
    type: "function",
    function: {
      name: "take_screenshot",
      description: "Captures a screenshot of a specified website and saves it as an image file.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL of the website to capture (e.g., https://google.com)."
          },
          outputPath: {
            type: "string",
            description: "The file path where the screenshot should be saved (e.g., 'homepage.png')."
          },
          fullPage: {
            type: "boolean",
            description: "If true, takes a screenshot of the full scrollable page instead of just the viewport."
          }
        },
        required: ["url", "outputPath"]
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    try {
      console.log(`Navigating to ${args.url} for screenshot...`);
      await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait a bit for animations etc.
      await page.waitForTimeout(1000);

      await page.screenshot({ 
        path: args.outputPath, 
        fullPage: args.fullPage || false 
      });

      return `Successfully captured screenshot of ${args.url} and saved to ${args.outputPath}`;

    } catch (error: any) {
      return `Error taking screenshot: ${error.message}`;
    } finally {
      await browser.close();
    }
  }
};
