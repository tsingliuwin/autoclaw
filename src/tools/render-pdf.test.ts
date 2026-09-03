import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RenderPdfTool } from './render-pdf.js';

describe('RenderPdfTool', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-render-pdf-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders an HTML template to a PDF file', async () => {
    const out = path.join(tmpDir, 'invoice.pdf');
    const result = await RenderPdfTool.handler({
      template: '<div><h1>Invoice #1024</h1><p>Consulting services for September 2026.</p></div>',
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain(out);
    expect(result).toContain('PDF');
    const bytes = fs.readFileSync(out);
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('accepts header and footer bands with page counters', async () => {
    const out = path.join(tmpDir, 'report.pdf');
    const result = await RenderPdfTool.handler({
      template: '<div><h1>Weekly Report</h1><p>Body content for the report document.</p></div>',
      header: '<div style="font-size:10px;color:#888">AutoClaw</div>',
      footer: '<div style="width:100%;text-align:center;font-size:10px;color:#888">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      title: 'Weekly Report',
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain(out);
    const bytes = fs.readFileSync(out);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('creates missing parent directories for the output path', async () => {
    const out = path.join(tmpDir, 'nested', 'report.pdf');
    const result = await RenderPdfTool.handler({
      template: '<div><h1>Deep</h1></div>',
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain(out);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('rejects a missing template', async () => {
    const result = await RenderPdfTool.handler({ output_path: path.join(tmpDir, 'x.pdf') }, {});
    expect(result).toContain("'template' is required");
  });

  it('rejects a missing output_path', async () => {
    const result = await RenderPdfTool.handler({ template: '<div>ok</div>' }, {});
    expect(result).toContain("'output_path' is required");
  });

  it('rejects an invalid page size', async () => {
    const result = await RenderPdfTool.handler({
      template: '<div>ok</div>',
      size: 'a10',
      output_path: path.join(tmpDir, 'x.pdf')
    }, {});
    expect(result).toContain("Invalid page size 'a10'");
  });
});
