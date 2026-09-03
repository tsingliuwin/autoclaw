import * as fs from 'fs';
import * as path from 'path';
import { render, renderSvg, renderAnimation } from 'takumi-js';
import { ToolModule, ToolDefinition } from './interface.js';
import { resolveFontLoaders, describeFonts } from './takumi-fonts.js';

const VALID_FORMATS = ['png', 'jpeg', 'webp', 'svg'];
const VALID_ANIMATION_FORMATS = ['webp', 'gif', 'apng'];

const toolDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "render_image",
    description: "Render an HTML template into a precise, deterministic image (PNG/JPEG/WebP), vector SVG, or animation (animated WebP/GIF/APNG from CSS @keyframes). Fully offline — no AI, no network, no browser, renders in milliseconds. Use this when exact text, layout, colors or data matter: OG/share cards, banners, badges, certificates, data cards, charts built from divs, simple motion graphics. Style with the 'tw' attribute (Tailwind v4 utilities, e.g. <div tw=\"w-full h-full bg-blue-500\">), inline styles, or a <style> block with regular CSS classes — Tailwind utilities placed in the class attribute are NOT compiled, always use tw for them. JavaScript is NOT executed; remote images in the template would require network. For artistic or photographic imagery use generate_image instead. CJK/emoji text needs fonts: common system fonts are auto-detected when font_paths is omitted, and registered families can be referenced via font-family.",
    parameters: {
      type: "object",
      properties: {
        template: {
          type: "string",
          description: "HTML fragment to render. Size the root to fill the canvas, e.g. '<div tw=\"w-full h-full flex flex-col items-center justify-center bg-linear-to-br from-blue-600 to-indigo-900 p-12\"><h1 tw=\"text-6xl font-bold text-white\">Monthly Report</h1></div>'. Style via the tw attribute (canonical Tailwind v4 names only — v3 names like bg-gradient-to-* are not supported, use bg-linear-to-*), inline styles, or a <style> block; a plain class attribute only matches CSS selectors, not Tailwind utilities."
        },
        css: {
          type: "string",
          description: "Optional CSS stylesheet applied before rendering, e.g. 'h1 { letter-spacing: 2px; }'."
        },
        width: {
          type: "integer",
          description: "Canvas width in px. Default 1200."
        },
        height: {
          type: "integer",
          description: "Canvas height in px. Default 630 (standard OG-image size)."
        },
        format: {
          type: "string",
          enum: VALID_FORMATS,
          description: "Output format. Default 'png'. 'svg' produces a vector document instead of a bitmap. Ignored when 'animation' is set."
        },
        animation: {
          type: "object",
          description: "Render an animated image instead of a static one: CSS @keyframes in the template (via a <style> block or the animation shorthand) are sampled across the scene duration. When set, 'format' is ignored — the container format comes from animation.format.",
          properties: {
            duration_ms: { type: "integer", description: "Scene duration in milliseconds. Default 1000." },
            fps: { type: "integer", description: "Frames per second. Default 30." },
            format: { type: "string", enum: VALID_ANIMATION_FORMATS, description: "Animation container format. Default 'webp'." }
          }
        },
        quality: {
          type: "integer",
          description: "0-100, JPEG/WebP only. Omit for lossless WebP / default JPEG quality."
        },
        font_paths: {
          type: "array",
          items: { type: "string" },
          description: "Local font files (.ttf/.otf/.ttc/.woff2) to register. Omit to auto-detect common system fonts (incl. CJK/emoji). Pass [] to skip font loading (built-in Latin font only)."
        },
        output_path: {
          type: "string",
          description: "File path to write the rendered image. Parent directories are created automatically."
        }
      },
      required: ["template", "output_path"]
    }
  }
};

const handler = async (args: any, config?: any): Promise<string> => {
  const template = typeof args.template === 'string' ? args.template : '';
  if (!template.trim()) {
    return "Error: 'template' is required — an HTML fragment to render.";
  }
  if (!args.output_path) {
    return "Error: 'output_path' is required.";
  }

  const format = String(args.format || 'png').toLowerCase();
  if (!VALID_FORMATS.includes(format)) {
    return `Error: Invalid format '${format}'. Supported formats: ${VALID_FORMATS.join(", ")}.`;
  }

  const anim = args.animation && typeof args.animation === 'object' ? args.animation : null;
  if (anim && anim.format != null && !VALID_ANIMATION_FORMATS.includes(String(anim.format).toLowerCase())) {
    return `Error: Invalid animation format '${anim.format}'. Supported: ${VALID_ANIMATION_FORMATS.join(", ")}.`;
  }

  const width = args.width || 1200;
  const height = args.height || 630;
  const resolvedPath = path.resolve(process.cwd(), args.output_path);

  try {
    const resolved = resolveFontLoaders(args.font_paths);
    const fontsInfo = describeFonts(resolved);

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    if (anim) {
      const animFormat = String(anim.format || 'webp').toLowerCase();
      const options: any = {
        width,
        height,
        fps: anim.fps || 30,
        format: animFormat,
        scenes: [{ node: template, durationMs: anim.duration_ms || 1000 }]
      };
      if (resolved.fonts.length > 0) options.fonts = resolved.fonts;
      if (args.css) options.css = args.css;
      const bytes = await renderAnimation(options);
      const buffer = Buffer.from(bytes);
      fs.writeFileSync(resolvedPath, buffer);
      return `Rendered animation (${width}x${height} ${animFormat.toUpperCase()}, ${anim.fps || 30}fps, ${anim.duration_ms || 1000}ms, ${buffer.length} bytes) saved to ${resolvedPath}. Fonts: ${fontsInfo}`;
    }

    if (format === 'svg') {
      const options: any = { width, height };
      if (resolved.fonts.length > 0) options.fonts = resolved.fonts;
      if (args.css) options.css = args.css;
      const svg = await renderSvg(template, options);
      fs.writeFileSync(resolvedPath, svg, 'utf-8');
      return `Rendered vector SVG (${width}x${height}, ${Buffer.byteLength(svg)} bytes) saved to ${resolvedPath}. Fonts: ${fontsInfo}`;
    }

    const options: any = { width, height, format };
    if (resolved.fonts.length > 0) options.fonts = resolved.fonts;
    if (args.css) options.css = args.css;
    if (args.quality != null && (format === 'jpeg' || format === 'webp')) {
      options.quality = args.quality;
    }

    const bytes = await render(template, options);
    const buffer = Buffer.from(bytes);
    fs.writeFileSync(resolvedPath, buffer);
    return `Rendered image (${width}x${height} ${format.toUpperCase()}, ${buffer.length} bytes) saved to ${resolvedPath}. Fonts: ${fontsInfo}`;
  } catch (err: any) {
    return `Error rendering image: ${err?.message || err}`;
  }
};

export const RenderImageTool: ToolModule = {
  name: "Image Renderer (Takumi)",
  definition: toolDefinition,
  handler
};
