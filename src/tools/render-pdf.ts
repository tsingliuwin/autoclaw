import * as fs from 'fs';
import * as path from 'path';
import { render as renderPdf } from 'takumi-pdf';
import { ToolModule, ToolDefinition } from './interface.js';
import { resolveFontLoaders, describeFonts } from './takumi-fonts.js';

const VALID_SIZES = ['a3', 'a4', 'a5', 'b4', 'b5', 'letter', 'legal', 'ledger'];

const toolDefinition: ToolDefinition = {
  type: "function",
  function: {
    name: "render_pdf",
    description: "Render an HTML template into a paged PDF document with selectable text and embedded subset fonts. Fully offline — no browser, no network, renders in milliseconds. Use for invoices, quotes, reports, packing slips, certificates and any structured document. Content flows across pages automatically; CSS break-before/break-after/break-inside control page breaks, and <thead> repeats on every page of a table. Optional header/footer bands repeat on every page and support page counters via <span class=\"pageNumber\"></span> and <span class=\"totalPages\"></span>. Style with inline styles, a <style> block with regular CSS classes, or the 'tw' attribute (Tailwind v4 utilities) — Tailwind utilities placed in the class attribute are NOT compiled. JavaScript is NOT executed. CJK text needs fonts: common system fonts are auto-detected when font_paths is omitted, and registered families can be referenced via font-family.",
    parameters: {
      type: "object",
      properties: {
        template: {
          type: "string",
          description: "HTML fragment for the document body, e.g. '<div style=\"padding:32px\"><h1 style=\"font-size:24px;font-weight:700\">Invoice #1024</h1><table style=\"width:100%\">…</table></div>'. Style via inline styles, a <style> block, or the tw attribute (Tailwind v4 utilities); a plain class attribute only matches CSS selectors, not Tailwind utilities."
        },
        css: {
          type: "string",
          description: "Optional CSS stylesheet applied before layout, e.g. 'tr { break-inside: avoid; }'."
        },
        size: {
          type: "string",
          enum: VALID_SIZES,
          description: "Page size. Default 'a4'."
        },
        landscape: {
          type: "boolean",
          description: "Swap page width and height. Default false."
        },
        margin: {
          description: "Page margin in CSS px: a number applied to all sides, or an object {top,right,bottom,left}. Default 'auto'.",
          type: ["number", "object"]
        },
        header: {
          type: "string",
          description: "HTML band repeated at the top of every page, e.g. '<div class=\"text-[10px] text-gray-500\">ACME Ltd</div>'."
        },
        footer: {
          type: "string",
          description: "HTML band repeated at the bottom of every page, e.g. '<div class=\"text-[10px] text-gray-500\" style=\"width:100%;text-align:center\">Page <span class=\"pageNumber\"></span> of <span class=\"totalPages\"></span></div>'."
        },
        font_paths: {
          type: "array",
          items: { type: "string" },
          description: "Local font files (.ttf/.otf/.ttc/.woff2) to register and embed. Omit to auto-detect common system fonts (incl. CJK). Pass [] to skip font loading (built-in Latin font only)."
        },
        title: {
          type: "string",
          description: "Document title written to the PDF metadata."
        },
        outline: {
          type: "boolean",
          description: "Build a bookmark outline from h1-h6 headings. Default false."
        },
        output_path: {
          type: "string",
          description: "File path to write the PDF. Parent directories are created automatically."
        }
      },
      required: ["template", "output_path"]
    }
  }
};

const handler = async (args: any, config?: any): Promise<string> => {
  const template = typeof args.template === 'string' ? args.template : '';
  if (!template.trim()) {
    return "Error: 'template' is required — an HTML fragment for the document body.";
  }
  if (!args.output_path) {
    return "Error: 'output_path' is required.";
  }

  const size = String(args.size || 'a4').toLowerCase();
  if (!VALID_SIZES.includes(size)) {
    return `Error: Invalid page size '${size}'. Supported sizes: ${VALID_SIZES.join(", ")}.`;
  }

  const resolvedPath = path.resolve(process.cwd(), args.output_path);

  try {
    const resolved = resolveFontLoaders(args.font_paths);
    const fontsInfo = describeFonts(resolved);

    const options: any = { size };
    if (resolved.fonts.length > 0) options.fonts = resolved.fonts;
    if (args.css) options.css = args.css;
    if (args.landscape) options.landscape = true;
    if (args.margin != null) options.margin = args.margin;
    if (args.header) options.header = args.header;
    if (args.footer) options.footer = args.footer;
    if (args.title) options.metadata = { title: args.title };
    if (args.outline) options.outline = true;

    const bytes = await renderPdf(template, options);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, Buffer.from(bytes));
    return `Rendered PDF (${bytes.length} bytes, ${size.toUpperCase()} page size) saved to ${resolvedPath}. Fonts: ${fontsInfo}`;
  } catch (err: any) {
    return `Error rendering PDF: ${err?.message || err}`;
  }
};

export const RenderPdfTool: ToolModule = {
  name: "PDF Renderer (Takumi)",
  definition: toolDefinition,
  handler
};
