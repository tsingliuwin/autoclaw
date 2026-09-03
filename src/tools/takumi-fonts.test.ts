import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveFontLoaders, describeFonts } from './takumi-fonts.js';

describe('resolveFontLoaders', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-fonts-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads explicit font files and derives family names', () => {
    const fontFile = path.join(tmpDir, 'MyFont-Regular.ttf');
    fs.writeFileSync(fontFile, Buffer.from([0x00, 0x01, 0x00, 0x00]));

    const resolved = resolveFontLoaders([fontFile]);

    expect(resolved.families).toEqual(['MyFont-Regular']);
    expect(resolved.fonts).toHaveLength(1);
    expect(Buffer.isBuffer(resolved.fonts[0].data)).toBe(true);
  });

  it('skips unreadable paths and reports them', () => {
    const missing = path.join(tmpDir, 'missing.ttf');
    const resolved = resolveFontLoaders([missing]);

    expect(resolved.fonts).toHaveLength(0);
    expect(resolved.skipped).toEqual([missing]);
  });

  it('passes an empty font_paths array through without auto-detection', () => {
    const resolved = resolveFontLoaders([]);
    expect(resolved.fonts).toHaveLength(0);
    expect(resolved.families).toEqual([]);
  });
});

describe('describeFonts', () => {
  it('explains when no fonts are registered', () => {
    const message = describeFonts({ fonts: [], families: [], skipped: [] });
    expect(message).toContain('no extra fonts registered');
    expect(message).toContain('font_paths');
  });

  it('lists registered families and skipped files', () => {
    const message = describeFonts({
      fonts: [{ name: 'MyFont', data: Buffer.alloc(0) }],
      families: ['MyFont'],
      skipped: ['/fonts/broken.ttf']
    });
    expect(message).toContain('registered: MyFont');
    expect(message).toContain('skipped (unreadable): /fonts/broken.ttf');
  });
});
