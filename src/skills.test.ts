import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildSkillsManifest,
  discoverSkills,
  installSkill,
  installSkillFromUrl,
  packSkill,
  parseSkillMd,
  removeSkill,
  type SkillScope
} from './skills.js';
import { createZip, readZip } from './zip.js';

const SAMPLE_SKILL_MD = `---
name: demo-skill
display_name: 演示技能
description: Renders demo cards from HTML templates. 触发词: 生成卡片
description_zh: 用 HTML 模板渲染演示卡片
version: 1.2.0
author: AutoClaw
disable-model-invocation: false
---

# Demo Skill

When the user asks for a demo card, write HTML and run scripts/render.mjs.
`;

function writeSkill(root: string, name: string, skillMd: string, extraFiles?: Record<string, string>) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd);
  for (const [rel, content] of Object.entries(extraFiles || {})) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

describe('parseSkillMd', () => {
  it('parses frontmatter keys, strips quotes, keeps the body', () => {
    const parsed = parseSkillMd(SAMPLE_SKILL_MD);
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.name).toBe('demo-skill');
    expect(parsed!.frontmatter.version).toBe('1.2.0');
    expect(parsed!.frontmatter['disable-model-invocation']).toBe('false');
    expect(parsed!.frontmatter.description).toContain('触发词');
    expect(parsed!.body).toContain('# Demo Skill');
  });

  it('supports quoted values, comments and blank lines', () => {
    const parsed = parseSkillMd('---\n# a comment\nname: "quoted name"\n\nversion: 2.0\n---\nbody');
    expect(parsed!.frontmatter.name).toBe('quoted name');
    expect(parsed!.frontmatter.version).toBe('2.0');
    expect(parsed!.body).toBe('body');
  });

  it('returns null when frontmatter is missing', () => {
    expect(parseSkillMd('# just markdown')).toBeNull();
  });
});

describe('discoverSkills', () => {
  let tmpDir: string;
  let scopes: SkillScope[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-skills-'));
    scopes = [
      { dir: path.join(tmpDir, 'builtin'), source: 'builtin' },
      { dir: path.join(tmpDir, 'user'), source: 'user' },
      { dir: path.join(tmpDir, 'project'), source: 'project' }
    ];
    for (const s of scopes) fs.mkdirSync(s.dir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers skills per scope and reports missing SKILL.md as warning', () => {
    writeSkill(scopes[0].dir, 'alpha', SAMPLE_SKILL_MD.replace('demo-skill', 'alpha'));
    fs.mkdirSync(path.join(scopes[0].dir, 'broken'), { recursive: true }); // no SKILL.md

    const { skills, warnings } = discoverSkills(scopes);
    expect(skills.map(s => s.name)).toEqual(['alpha']);
    expect(skills[0].source).toBe('builtin');
    expect(warnings.some(w => w.includes('no SKILL.md'))).toBe(true);
  });

  it('applies shadowing: project > user > builtin on name collision', () => {
    writeSkill(scopes[0].dir, 'shared', SAMPLE_SKILL_MD.replace('demo-skill', 'shared').replace('1.2.0', '1.0.0'));
    writeSkill(scopes[1].dir, 'shared', SAMPLE_SKILL_MD.replace('demo-skill', 'shared').replace('1.2.0', '1.1.0'));
    writeSkill(scopes[2].dir, 'shared', SAMPLE_SKILL_MD.replace('demo-skill', 'shared').replace('1.2.0', '2.0.0'));

    const { skills } = discoverSkills(scopes);
    expect(skills).toHaveLength(1);
    expect(skills[0].version).toBe('2.0.0');
    expect(skills[0].source).toBe('project');
  });

  it('skips dot-directories', () => {
    writeSkill(path.join(scopes[0].dir, '.hidden'), 'x', SAMPLE_SKILL_MD);
    // writeSkill created <root>/.hidden/x/SKILL.md — the .hidden dir itself must be skipped
    const { skills } = discoverSkills(scopes);
    expect(skills).toHaveLength(0);
  });
});

describe('buildSkillsManifest', () => {
  let tmpDir: string;
  let scopes: SkillScope[];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-manifest-'));
    scopes = [{ dir: path.join(tmpDir, 'skills'), source: 'builtin' }];
    fs.mkdirSync(scopes[0].dir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders one line per visible skill with its SKILL.md path', () => {
    writeSkill(scopes[0].dir, 'demo', SAMPLE_SKILL_MD);
    const manifest = buildSkillsManifest({}, scopes);
    expect(manifest).toContain('demo-skill (v1.2.0)');
    expect(manifest).toContain('SKILL.md');
    expect(manifest).toContain(path.join(scopes[0].dir, 'demo', 'SKILL.md'));
  });

  it('hides skills flagged disable-model-invocation and honors skillsEnabled=false', () => {
    writeSkill(scopes[0].dir, 'manual', SAMPLE_SKILL_MD.replace('disable-model-invocation: false', 'disable-model-invocation: true').replace('demo-skill', 'manual-skill'));
    expect(buildSkillsManifest({}, scopes)).toBeNull();
    writeSkill(scopes[0].dir, 'auto', SAMPLE_SKILL_MD.replace('demo-skill', 'auto-skill'));
    expect(buildSkillsManifest({}, scopes)).toContain('auto-skill');
    expect(buildSkillsManifest({ skillsEnabled: false }, scopes)).toBeNull();
  });

  it('truncates overlong descriptions', () => {
    const long = SAMPLE_SKILL_MD.replace(
      'description: Renders demo cards from HTML templates. 触发词: 生成卡片',
      `description: ${'very long description '.repeat(30)}`
    );
    writeSkill(scopes[0].dir, 'long', long.replace('demo-skill', 'long-skill'));
    const manifest = buildSkillsManifest({}, scopes);
    expect(manifest).toContain('…');
    expect(manifest!.split('\n').find(l => l.includes('long-skill'))!.length).toBeLessThan(640);
  });
});

describe('install / remove / pack roundtrip', () => {
  let tmpDir: string;
  let userDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoclaw-install-'));
    userDir = path.join(tmpDir, 'user-skills');
    fs.mkdirSync(userDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs from a directory, skipping node_modules', () => {
    const src = writeSkill(tmpDir, 'my-skill', SAMPLE_SKILL_MD.replace('demo-skill', 'my-skill'), {
      'scripts/run.mjs': 'console.log(1);',
      'node_modules/junk/index.js': 'junk'
    });
    const result = installSkill(src, { userDir });
    expect(result.name).toBe('my-skill');
    expect(fs.existsSync(path.join(userDir, 'my-skill', 'scripts', 'run.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(userDir, 'my-skill', 'node_modules'))).toBe(false);
  });

  it('pack -> install roundtrip preserves the whole package', () => {
    const src = writeSkill(path.join(tmpDir, 'pack-src'), 'roundtrip', SAMPLE_SKILL_MD.replace('demo-skill', 'roundtrip'), {
      'scripts/run.mjs': 'console.log(1);',
      'references/guide.md': '# Guide',
      'templates/card.html': '<div tw="w-full h-full"></div>'
    });
    const packed = packSkill(src, path.join(tmpDir, 'roundtrip-skill.zip'));
    expect(packed.name).toBe('roundtrip');
    expect(packed.fileCount).toBe(4);
    expect(packed.version).toBe('1.2.0');

    const entries = readZip(fs.readFileSync(packed.zipPath)).map(e => e.path);
    expect(entries).toContain('SKILL.md'); // zip root is the skill itself, no wrapper dirs
    expect(entries).toContain('scripts/run.mjs');

    const installed = installSkill(packed.zipPath, { userDir });
    expect(installed.name).toBe('roundtrip');
    expect(fs.readFileSync(path.join(userDir, 'roundtrip', 'references', 'guide.md'), 'utf-8')).toBe('# Guide');
  });

  it('names the default zip after the skill and its version', () => {
    const src = writeSkill(path.join(tmpDir, 'vskill'), 'versioned', SAMPLE_SKILL_MD.replace('demo-skill', 'versioned'));
    process.chdir(tmpDir);
    try {
      const packed = packSkill(src);
      expect(packed.version).toBe('1.2.0');
      expect(path.basename(packed.zipPath)).toBe('versioned-skill-1.2.0.zip');
      expect(fs.existsSync(packed.zipPath)).toBe(true);
    } finally {
      process.chdir(os.tmpdir());
    }
  });

  it('rejects zips without SKILL.md', () => {
    const zipPath = path.join(tmpDir, 'not-a-skill.zip');
    fs.writeFileSync(zipPath, Buffer.from('not a zip'));
    expect(() => installSkill(zipPath, { userDir })).toThrow();
  });

  it('installs third-party layouts: SKILL.md at zip root', () => {
    const zip = createZip([
      { path: 'SKILL.md', data: Buffer.from(SAMPLE_SKILL_MD) },
      { path: 'scripts/run.mjs', data: Buffer.from('console.log(1);') }
    ]);
    const zipPath = path.join(tmpDir, 'rootless.zip');
    fs.writeFileSync(zipPath, zip);
    const result = installSkill(zipPath, { userDir });
    expect(result.name).toBe('demo-skill'); // from frontmatter, not the zip stem
    expect(fs.existsSync(path.join(userDir, 'demo-skill', 'scripts', 'run.mjs'))).toBe(true);
  });

  it('installs under the frontmatter name even when the folder differs, and rebases contents', () => {
    const zip = createZip([
      { path: 'skills/wrong-folder-name/SKILL.md', data: Buffer.from(SAMPLE_SKILL_MD) },
      { path: 'skills/wrong-folder-name/references/guide.md', data: Buffer.from('# G') }
    ]);
    const zipPath = path.join(tmpDir, 'wrapped.zip');
    fs.writeFileSync(zipPath, zip);
    const result = installSkill(zipPath, { userDir });
    expect(result.name).toBe('demo-skill');
    expect(fs.existsSync(path.join(userDir, 'demo-skill', 'references', 'guide.md'))).toBe(true);
    expect(fs.existsSync(path.join(userDir, 'wrong-folder-name'))).toBe(false);
  });

  it('accepts non-ASCII frontmatter names and filters macOS junk', () => {
    const skillMd = SAMPLE_SKILL_MD.replace('demo-skill', '渲染技能');
    const zip = createZip([
      { path: 'skills/渲染技能/SKILL.md', data: Buffer.from(skillMd) },
      { path: '__MACOSX/skills/渲染技能/._SKILL.md', data: Buffer.from('junk') },
      { path: 'skills/渲染技能/templates/.DS_Store', data: Buffer.from('junk') },
      { path: 'skills/渲染技能/templates/card.html', data: Buffer.from('<div></div>') }
    ]);
    const zipPath = path.join(tmpDir, 'cjk.zip');
    fs.writeFileSync(zipPath, zip);
    const result = installSkill(zipPath, { userDir });
    expect(result.name).toBe('渲染技能');
    expect(fs.existsSync(path.join(userDir, '渲染技能', 'templates', 'card.html'))).toBe(true);
    expect(fs.existsSync(path.join(userDir, '渲染技能', 'templates', '.DS_Store'))).toBe(false);
    expect(fs.existsSync(path.join(userDir, '__MACOSX'))).toBe(false);
  });

  it('installs from an https URL', async () => {
    const zip = createZip([{ path: 'SKILL.md', data: Buffer.from(SAMPLE_SKILL_MD.replace('demo-skill', 'url-skill')) }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength))
    }));
    try {
      const result = await installSkillFromUrl('https://example.com/url-skill.zip', { userDir });
      expect(result.name).toBe('url-skill');
      expect(fs.existsSync(path.join(userDir, 'url-skill', 'SKILL.md'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces download failures for https installs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    try {
      await expect(installSkillFromUrl('https://example.com/missing.zip', { userDir })).rejects.toThrow(/404/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('remove deletes only from the user scope', () => {
    const builtinDir = path.join(tmpDir, 'builtin');
    writeSkill(builtinDir, 'keeper', SAMPLE_SKILL_MD.replace('demo-skill', 'keeper'));
    const builtinScopes: SkillScope[] = [{ dir: builtinDir, source: 'builtin' }];
    const bothScopes: SkillScope[] = [...builtinScopes, { dir: userDir, source: 'user' }];
    installSkill(path.join(builtinDir, 'keeper'), { userDir });

    // Discovery limited to the builtin scope reports the skill as builtin.
    expect(removeSkill('keeper', { userDir, scopes: builtinScopes })).toBe('builtin');
    expect(fs.existsSync(path.join(builtinDir, 'keeper'))).toBe(true);
    expect(fs.existsSync(path.join(userDir, 'keeper'))).toBe(true);

    // With both scopes the user copy shadows the builtin and gets removed;
    // the built-in file itself must survive.
    expect(removeSkill('keeper', { userDir, scopes: bothScopes })).toBe('removed');
    expect(fs.existsSync(path.join(userDir, 'keeper'))).toBe(false);
    expect(fs.existsSync(path.join(builtinDir, 'keeper'))).toBe(true);
    expect(removeSkill('keeper', { userDir, scopes: bothScopes })).toBe('builtin');

    expect(removeSkill('nope', { userDir, scopes: bothScopes })).toBe('not-found');
  });
});
