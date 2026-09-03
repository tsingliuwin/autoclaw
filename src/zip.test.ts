import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createZip, extractZip, readZip, safeJoinZipPath } from './zip.js';

describe('zip roundtrip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-zip-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('roundtrips text and binary content through create/read/extract', () => {
    const files = [
      { path: 'skills/demo/SKILL.md', data: Buffer.from('---\nname: demo\n---\n# Demo', 'utf-8') },
      { path: 'skills/demo/assets/logo.bin', data: Buffer.from([0, 1, 2, 255, 254, 0, 137, 80]) },
      { path: 'skills/demo/empty.txt', data: Buffer.from('') }
    ];
    const zip = createZip(files);
    const entries = readZip(zip);
    expect(entries).toHaveLength(3);
    expect(entries[0].path).toBe('skills/demo/SKILL.md');
    expect(entries[0].data.toString('utf-8')).toBe(files[0].data.toString('utf-8'));
    expect(Buffer.compare(entries[1].data, files[1].data)).toBe(0);

    const outDir = path.join(tmpDir, 'out');
    const written = extractZip(zip, outDir);
    expect(written).toHaveLength(3);
    expect(fs.readFileSync(path.join(outDir, 'skills/demo/SKILL.md'), 'utf-8'))
      .toBe(files[0].data.toString('utf-8'));
    expect(fs.readFileSync(path.join(outDir, 'skills/demo/assets/logo.bin')))
      .toEqual(files[1].data);
  });

  it('produces deterministic bytes for identical input', () => {
    const files = [{ path: 'a.txt', data: Buffer.from('hello') }];
    expect(Buffer.compare(createZip(files), createZip(files))).toBe(0);
  });

  it('reads back externally readable zips (deflate stream valid)', () => {
    // A large, compressible payload exercises the deflate path.
    const big = Buffer.from('AutoClaw skill payload. '.repeat(10000));
    const entries = readZip(createZip([{ path: 'big.txt', data: big }]));
    expect(Buffer.compare(entries[0].data, big)).toBe(0);
  });

  it('rejects non-zip input', () => {
    expect(() => readZip(Buffer.from('definitely not a zip'))).toThrow(/not a zip/);
  });
});

describe('zip-slip protection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-zip-slip-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects .. traversal entries', () => {
    expect(() => safeJoinZipPath(tmpDir, '../evil.txt')).toThrow(/path traversal/);
    expect(() => safeJoinZipPath(tmpDir, 'skills/demo/../../../evil.txt')).toThrow(/path traversal/);
  });

  it('rejects absolute and drive-letter entries', () => {
    expect(() => safeJoinZipPath(tmpDir, '/etc/evil.txt')).toThrow(/absolute/);
    expect(() => safeJoinZipPath(tmpDir, 'C:\\Windows\\evil.txt')).toThrow(/absolute/);
  });

  it('returns null for directory entries and extracts the rest safely', () => {
    expect(safeJoinZipPath(tmpDir, 'skills/demo/')).toBeNull();
    const zip = createZip([
      { path: 'skills/demo/SKILL.md', data: Buffer.from('ok') },
      { path: '../evil.txt', data: Buffer.from('bad') }
    ]);
    expect(() => extractZip(zip, tmpDir)).toThrow(/path traversal/);
    // Nothing may be written when the archive is rejected mid-way.
    expect(fs.existsSync(path.join(tmpDir, 'skills'))).toBe(false);
  });
});
