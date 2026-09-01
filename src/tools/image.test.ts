import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ImageTool } from './image.js';

const mocks = vi.hoisted(() => ({
  generateMock: vi.fn(),
  createVariationMock: vi.fn(),
  editMock: vi.fn()
}));

vi.mock('openai', () => {
  class MockOpenAI {
    images = {
      generate: mocks.generateMock,
      createVariation: mocks.createVariationMock,
      edit: mocks.editMock
    };
    constructor(_config: any) {}
  }
  return { default: MockOpenAI };
});

describe('ImageTool', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autoclaw-image-test-'));
  });

  it('returns configuration error when no image/api key is available', async () => {
    const result = await ImageTool.handler({ prompt: 'cat' }, {});
    expect(result).toContain('Image Service API Key is missing');
  });

  it('validates unsupported size for dall-e-3', async () => {
    const result = await ImageTool.handler(
      {
        mode: 'text-to-image',
        prompt: 'sunset',
        model: 'dall-e-3',
        size: '256x256'
      },
      { apiKey: 'test-key' }
    );

    expect(result).toContain("Invalid size '256x256' for DALL-E 3");
    expect(mocks.generateMock).not.toHaveBeenCalled();
  });

  it('generates and saves an image for text-to-image mode', async () => {
    mocks.generateMock.mockResolvedValue({
      data: [{ url: 'https://img.example/1.png' }]
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
      })
    );

    const result = await ImageTool.handler(
      {
        mode: 'text-to-image',
        prompt: 'a minimalist logo',
        model: 'dall-e-2',
        n: 1,
        size: '1024x1024',
        output_dir: tempDir
      },
      { apiKey: 'test-key' }
    );

    expect(mocks.generateMock).toHaveBeenCalledTimes(1);
    expect(result).toContain('Successfully generated 1 image(s):');

    const files = await fs.readdir(tempDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^generated-\d+-1\.png$/);
  });

  it('creates a variation from an existing image', async () => {
    const src = path.join(tempDir, 'src.png');
    await fs.writeFile(src, 'png-bytes');
    mocks.createVariationMock.mockResolvedValue({ data: [{ url: 'https://img.example/v.png' }] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([9]).buffer) })
    );

    const result = await ImageTool.handler({ image_path: src, output_dir: tempDir }, { apiKey: 'test-key' });

    expect(mocks.createVariationMock).toHaveBeenCalledTimes(1);
    expect(result).toContain('Successfully generated 1 image(s):');
    const files = await fs.readdir(tempDir);
    expect(files.some(f => f.startsWith('variation-'))).toBe(true);
  });

  it('edits an image with prompt and mask', async () => {
    const src = path.join(tempDir, 'src.png');
    const mask = path.join(tempDir, 'mask.png');
    await fs.writeFile(src, 'png-bytes');
    await fs.writeFile(mask, 'mask-bytes');
    mocks.editMock.mockResolvedValue({ data: [{ url: 'https://img.example/e.png' }] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([7]).buffer) })
    );

    const result = await ImageTool.handler(
      { image_path: src, mask_path: mask, prompt: 'add a hat', output_dir: tempDir },
      { apiKey: 'test-key' }
    );

    expect(mocks.editMock).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'add a hat' }));
    expect(result).toContain('Successfully generated 1 image(s):');
    const files = await fs.readdir(tempDir);
    expect(files.some(f => f.startsWith('edited-'))).toBe(true);
  });

  it('rejects an unknown mode', async () => {
    const result = await ImageTool.handler({ mode: 'teleport', prompt: 'x' }, { apiKey: 'test-key' });

    expect(result).toContain("Unknown mode 'teleport'");
  });
});
