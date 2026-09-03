import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RenderImageTool } from './render-image.js';

describe('RenderImageTool', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-render-image-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders an HTML template to a PNG file', async () => {
    const out = path.join(tmpDir, 'card.png');
    const result = await RenderImageTool.handler({
      template: '<div tw="w-full h-full flex items-center justify-center bg-blue-500"><h1 tw="text-4xl font-bold text-white">Hello AutoClaw</h1></div>',
      width: 400,
      height: 200,
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain(out);
    expect(result).toContain('PNG');
    const bytes = fs.readFileSync(out);
    expect(bytes.length).toBeGreaterThan(100);
    expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('renders a JPEG with the correct magic bytes', async () => {
    const out = path.join(tmpDir, 'card.jpg');
    const result = await RenderImageTool.handler({
      template: '<div tw="w-full h-full bg-emerald-600"><h1>JPEG</h1></div>',
      width: 300,
      height: 150,
      format: 'jpeg',
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain('JPEG');
    const bytes = fs.readFileSync(out);
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  });

  it('renders vector SVG output', async () => {
    const out = path.join(tmpDir, 'card.svg');
    const result = await RenderImageTool.handler({
      template: '<div tw="w-full h-full flex items-center justify-center bg-red-100"><h1>Vector</h1></div>',
      width: 200,
      height: 100,
      format: 'svg',
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain('SVG');
    const text = fs.readFileSync(out, 'utf-8');
    expect(text).toContain('<svg');
  });

  it('creates missing parent directories for the output path', async () => {
    const out = path.join(tmpDir, 'nested', 'dir', 'card.png');
    const result = await RenderImageTool.handler({
      template: '<div tw="w-full h-full bg-slate-800"><h1>Deep</h1></div>',
      width: 200,
      height: 100,
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain(out);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('renders an animated WebP from CSS @keyframes', async () => {
    const out = path.join(tmpDir, 'anim.webp');
    const result = await RenderImageTool.handler({
      template: `<style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                 <div tw="w-full h-full flex items-center justify-center bg-slate-900">
                   <div style="width:80px;height:80px;border-radius:16px;background:#3b82f6;animation:spin 1s linear infinite"></div>
                 </div>`,
      width: 300,
      height: 300,
      animation: { duration_ms: 800, fps: 20 },
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain('Rendered animation');
    expect(result).toContain('WEBP');
    const bytes = fs.readFileSync(out);
    const latin1 = bytes.toString('latin1');
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
    expect(latin1.includes('ANIM')).toBe(true);
  });

  it('ignores format when animation is set and uses the animation container format', async () => {
    const out = path.join(tmpDir, 'anim.gif');
    const result = await RenderImageTool.handler({
      template: `<style>@keyframes slide { to { transform: translateX(100px); } }</style>
                 <div style="width:100%;height:100%;background:#0f172a">
                   <div style="width:40px;height:40px;background:#22c55e;animation:slide 0.5s linear infinite alternate"></div>
                 </div>`,
      width: 200,
      height: 200,
      format: 'png',
      animation: { format: 'gif' },
      output_path: out,
      font_paths: []
    }, {});

    expect(result).toContain('GIF');
    const bytes = fs.readFileSync(out);
    expect(bytes.subarray(0, 3).toString('latin1')).toBe('GIF');
  });

  it('rejects an invalid animation format', async () => {
    const result = await RenderImageTool.handler({
      template: '<div>ok</div>',
      animation: { format: 'mp4' },
      output_path: path.join(tmpDir, 'x.webp')
    }, {});
    expect(result).toContain("Invalid animation format 'mp4'");
  });

  it('rejects a missing template', async () => {
    const result = await RenderImageTool.handler({ output_path: path.join(tmpDir, 'x.png') }, {});
    expect(result).toContain("'template' is required");
  });

  it('rejects a missing output_path', async () => {
    const result = await RenderImageTool.handler({ template: '<div>ok</div>' }, {});
    expect(result).toContain("'output_path' is required");
  });

  it('rejects an invalid format', async () => {
    const result = await RenderImageTool.handler({
      template: '<div>ok</div>',
      format: 'bmp',
      output_path: path.join(tmpDir, 'x.bmp')
    }, {});
    expect(result).toContain("Invalid format 'bmp'");
  });
});
