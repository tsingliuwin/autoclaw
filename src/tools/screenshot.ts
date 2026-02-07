import { chromium } from 'playwright';
import { ToolModule } from './interface.js';
import * as fs from 'fs';
import * as os from 'os';

// Helper to check for common CJK font paths on Linux
const checkLinuxFonts = () => {
  if (os.platform() !== 'linux') return true;
  
  // Check for specific font files rather than just directories
  const commonFontFiles = [
    '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc', // Alpine / Some Debian
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', // Debian / Ubuntu
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', // ZenHei
    '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc' // Arch
  ];

  // Also check if fc-list finds any CJK fonts (if available)
  try {
      const child_process = require('child_process');
      const output = child_process.execSync('fc-list :lang=zh', { stdio: 'pipe' }).toString();
      if (output.length > 0) return true;
  } catch (e) {
      // fc-list might not be installed or failed, fall back to file check
  }

  return commonFontFiles.some(path => fs.existsSync(path));
};

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
      // Check for fonts on Linux to prevent "tofu" characters
      if (os.platform() === 'linux' && !checkLinuxFonts()) {
        console.warn("⚠️  Warning: No CJK fonts detected. Chinese characters may appear as squares (tofu).");
        console.warn("   Run 'apk add font-noto-cjk' (Alpine) or 'apt-get install fonts-noto-cjk' (Debian/Ubuntu).");
      }

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
        // Note: For Docker environments (Alpine/Debian), ensure fonts are installed.
        // Alpine: apk add font-noto-cjk
        // Debian/Ubuntu: apt-get install fonts-noto-cjk fonts-wqy-zenhei
        await page.addStyleTag({
          content: `
            body, h1, h2, h3, h4, h5, h6, p, span, div, li, a, button, input, textarea {
              font-family: "PingFang SC", "Heiti SC", "Microsoft YaHei", "WenQuanYi Micro Hei", "Noto Sans CJK SC", "Noto Sans SC", sans-serif !important;
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
  