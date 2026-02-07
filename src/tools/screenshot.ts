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
      const launchOptions: any = { 
          headless: true,
          args: ['--font-render-hinting=none'] 
      };
  
      try {
        // Try to launch system Chrome first as it usually has better font support
        browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
      } catch (e) {
        // Fallback to bundled Chromium
        try {
          browser = await chromium.launch(launchOptions);
        } catch (error: any) {
          if (error.message.includes("Executable doesn't exist")) {
            return "Error: Playwright browsers are not installed. Please run `npx playwright install chromium` to enable this feature.";
          }
          return `Error launching browser: ${error.message}`;
        }
      }
  
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'zh-CN', // Set locale to Chinese
        deviceScaleFactor: 2 // High DPI
      });
      const page = await context.newPage();
  
      try {
        console.log(`Navigating to ${args.url} for screenshot...`);
        await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Inject CSS to force common Chinese fonts
        await page.addStyleTag({
          content: `
            body, h1, h2, h3, h4, h5, h6, p, span, div, li, a, button, input, textarea {
              font-family: "PingFang SC", "Heiti SC", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif !important;
            }
          `
        });
  
        // Wait for fonts to be ready
        await page.evaluate(() => document.fonts.ready);
        
        // Additional small delay for dynamic content and font rendering
        await page.waitForTimeout(1000);
  
        await page.screenshot({ 
          path: args.outputPath, 
          fullPage: args.fullPage || false 
        });
  
        return `Successfully captured screenshot of ${args.url} and saved to ${args.outputPath}`;
  
      } catch (error: any) {
        return `Error taking screenshot: ${error.message}`;
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    }
  };
  