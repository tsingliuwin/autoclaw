import { chromium } from 'playwright';
import { ToolModule } from './interface.js';
import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';

// Helper to check for common CJK and Emoji font paths on Linux
const checkLinuxFonts = () => {
  if (os.platform() !== 'linux') return { cjk: true, emoji: true };
  
  // Check for specific font files rather than just directories
  const commonCJKFontFiles = [
    '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc', // Alpine / Some Debian
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', // Debian / Ubuntu
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', // ZenHei
    '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc' // Arch
  ];

  const commonEmojiFontFiles = [
    '/usr/share/fonts/noto/NotoColorEmoji.ttf',
    '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
    '/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf'
  ];

  const hasCJK = commonCJKFontFiles.some(path => fs.existsSync(path));
  const hasEmoji = commonEmojiFontFiles.some(path => fs.existsSync(path));

  // Also check if fc-list finds fonts (if available) - secondary check
  try {
      const cjkOutput = child_process.execSync('fc-list :lang=zh', { stdio: 'pipe' }).toString();
      const emojiOutput = child_process.execSync('fc-list :family=Emoji', { stdio: 'pipe' }).toString(); // Approximate check
      
      return {
          cjk: hasCJK || cjkOutput.length > 0,
          emoji: hasEmoji || emojiOutput.length > 0
      };
  } catch (e) {
      // fc-list might not be installed or failed, fall back to file check
      return { cjk: hasCJK, emoji: hasEmoji };
  }
};

const installFonts = (missing: { cjk: boolean, emoji: boolean }) => {
    try {
        let installCmd = '';
        if (fs.existsSync('/etc/alpine-release')) {
            // Alpine
            const pkgs = [];
            if (!missing.cjk) pkgs.push('font-noto-cjk');
            if (!missing.emoji) pkgs.push('font-noto-emoji');
            if (pkgs.length > 0) {
                installCmd = `apk add --no-cache ${pkgs.join(' ')}`;
            }
        } else if (fs.existsSync('/etc/debian_version')) {
            // Debian/Ubuntu
            const pkgs = [];
            if (!missing.cjk) pkgs.push('fonts-noto-cjk', 'fonts-wqy-zenhei');
            if (!missing.emoji) pkgs.push('fonts-noto-color-emoji');
            if (pkgs.length > 0) {
                // apt-get update is often needed first in clean containers
                installCmd = `apt-get update && apt-get install -y ${pkgs.join(' ')}`;
            }
        }

        if (installCmd) {
            console.log(`Creating font environment... (${installCmd})`);
            console.log("This may take a few moments...");
            child_process.execSync(installCmd, { stdio: 'inherit' });
            console.log('✅ Fonts installed successfully.');
            return true;
        }
    } catch (e: any) {
        console.warn(`⚠️ Failed to auto-install fonts: ${e.message}`);
        console.warn('Please install them manually to fix "tofu" characters.');
    }
    return false;
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
            description: "If true (default), takes a screenshot of the full scrollable page. Set to false for viewport only."
          }
        },
        required: ["url", "outputPath"]
      }
    }
  },
    handler: async (args: any, config: any) => {
      // Check for fonts on Linux to prevent "tofu" characters
      if (os.platform() === 'linux') {
          const fonts = checkLinuxFonts();
          if (!fonts.cjk || !fonts.emoji) {
             console.log("Missing fonts detected. Attempting to fix environment...");
             installFonts(fonts);
          }
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
        // Alpine: apk add font-noto-cjk font-noto-emoji
        // Debian/Ubuntu: apt-get install fonts-noto-cjk fonts-wqy-zenhei fonts-noto-color-emoji
        await page.addStyleTag({
          content: `
            body, h1, h2, h3, h4, h5, h6, p, span, div, li, a, button, input, textarea {
              font-family: "PingFang SC", "Heiti SC", "Microsoft YaHei", "WenQuanYi Micro Hei", "Noto Sans CJK SC", "Noto Sans SC", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif !important;
            }
          `
        });
  
        // Wait for fonts to be ready
        await page.evaluate(() => document.fonts.ready);
        
        // Additional small delay for dynamic content and font rendering
        await page.waitForTimeout(1000);
  
        await page.screenshot({ 
          path: args.outputPath, 
          fullPage: args.fullPage !== false // Default to true if undefined
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
  