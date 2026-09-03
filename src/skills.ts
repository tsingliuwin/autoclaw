import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createZip, readZip } from './zip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Skill = a SKILL.md package (frontmatter + instructions, optional
// references/scripts/templates). Same format as the WorkBuddy skill store, so
// one package runs both inside AutoClaw (manifest in the system prompt, files
// read via read_file, scripts executed via shell) and on other platforms.

export type SkillSource = 'builtin' | 'user' | 'project';

export interface SkillMeta {
  name: string;
  displayName?: string;
  description: string;
  descriptionZh?: string;
  descriptionEn?: string;
  version?: string;
  author?: string;
  category?: string;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  source: SkillSource;
  dir: string;
  skillMdPath: string;
}

export interface SkillScope {
  dir: string;
  source: SkillSource;
}

// Built-in skills ship with the package (dist/../skills); user + project
// scopes shadow built-ins on name collisions (project > user > builtin).
export function builtinSkillsDir(): string {
  return path.resolve(__dirname, '..', 'skills');
}

export function defaultSkillScopes(): SkillScope[] {
  return [
    { dir: builtinSkillsDir(), source: 'builtin' as SkillSource },
    { dir: path.join(os.homedir(), '.autoclaw', 'skills'), source: 'user' as SkillSource },
    { dir: path.resolve(process.cwd(), '.autoclaw', 'skills'), source: 'project' as SkillSource },
  ];
}

// ---- SKILL.md parsing (YAML subset: flat "key: value" lines, no nesting) ----

export interface ParsedSkillMd {
  frontmatter: Record<string, string>;
  body: string;
}

export function parseSkillMd(raw: string): ParsedSkillMd | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[kv[1]] = value;
  }
  return { frontmatter, body: raw.slice(match[0].length) };
}

function toMeta(frontmatter: Record<string, string>, dir: string, source: SkillSource): SkillMeta {
  const bool = (v?: string) => v === 'true' ? true : v === 'false' ? false : undefined;
  return {
    name: frontmatter.name || path.basename(dir),
    displayName: frontmatter.display_name,
    description: frontmatter.description || frontmatter.description_zh || frontmatter.description_en || '',
    descriptionZh: frontmatter.description_zh,
    descriptionEn: frontmatter.description_en,
    version: frontmatter.version,
    author: frontmatter.author,
    category: frontmatter.category,
    disableModelInvocation: bool(frontmatter['disable-model-invocation']),
    userInvocable: bool(frontmatter['user-invocable']),
    source,
    dir,
    skillMdPath: path.join(dir, 'SKILL.md'),
  };
}

// ---- discovery ----

export interface DiscoveryResult {
  skills: SkillMeta[];
  warnings: string[];
}

// Later scopes win on name collisions. Dirs starting with '.' are skipped.
export function discoverSkills(scopes: SkillScope[]): DiscoveryResult {
  const warnings: string[] = [];
  const byName = new Map<string, SkillMeta>();
  for (const scope of scopes) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(scope.dir, { withFileTypes: true })
        .filter((e): e is fs.Dirent => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name);
    } catch { /* scope dir missing — fine */ continue; }
    for (const entry of entries) {
      const dir = path.join(scope.dir, entry);
      const skillMdPath = path.join(dir, 'SKILL.md');
      let raw: string;
      try {
        raw = fs.readFileSync(skillMdPath, 'utf-8');
      } catch {
        warnings.push(`skipped ${dir}: no SKILL.md`);
        continue;
      }
      try {
        const parsed = parseSkillMd(raw);
        if (!parsed) {
          warnings.push(`skipped ${skillMdPath}: missing YAML frontmatter`);
          continue;
        }
        const meta = toMeta(parsed.frontmatter, dir, scope.source);
        if (!meta.description) {
          warnings.push(`skipped ${skillMdPath}: empty description`);
          continue;
        }
        byName.set(meta.name, meta);
      } catch (err: any) {
        warnings.push(`skipped ${skillMdPath}: ${err?.message || err}`);
      }
    }
  }
  return { skills: [...byName.values()], warnings };
}

// ---- system-prompt manifest (progressive disclosure: one line per skill) ----

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

export function buildSkillsManifest(config?: any, scopes?: SkillScope[]): string | null {
  if (config?.skillsEnabled === false) return null;
  const { skills } = discoverSkills(scopes || defaultSkillScopes());
  const visible = skills.filter(s => s.disableModelInvocation !== true);
  if (visible.length === 0) return null;
  const lines = visible.map(s =>
    `- ${s.name}${s.version ? ` (v${s.version})` : ''}: ${truncate(s.description, 160)} [read ${s.skillMdPath}]`
  );
  return [
    'INSTALLED SKILL PACKAGES (procedural capabilities bundling instructions, scripts and templates).',
    'When a task matches a skill, first read its SKILL.md and follow it — skills run through your normal file and shell tools, no special API:',
    ...lines,
  ].join('\n');
}

// ---- install / remove ----

const INSTALL_SKIP = new Set(['node_modules', '.git', '__MACOSX']);

function isJunkPath(rel: string): boolean {
  return rel.split('/').some(s => INSTALL_SKIP.has(s)) || rel.split('/').pop() === '.DS_Store';
}

// Skill directory names come from untrusted frontmatter, so restrict to
// letters (any script, e.g. Chinese), digits, dot, underscore, dash — no
// separators, no leading dot (discovery skips dot-dirs), bounded length.
function isSafeSkillName(name: string): boolean {
  return name.length <= 64 && /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(name);
}

function copyTree(src: string, dest: string): number {
  let count = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (INSTALL_SKIP.has(entry.name) || entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) count += copyTree(s, d);
    else if (entry.isFile()) { fs.copyFileSync(s, d); count++; }
  }
  return count;
}

export function userSkillsDir(): string {
  return path.join(os.homedir(), '.autoclaw', 'skills');
}

// Install from a skill directory, a zip package, or an https URL into the
// user scope (~/.autoclaw/skills/). The installed directory is named after
// the skill's frontmatter `name` (fallback: the folder/zip stem), so the
// path always matches what discovery and the manifest expect.
export function installSkill(target: string, opts?: { userDir?: string }): { name: string; dir: string; files: number } {
  const userDir = opts?.userDir || userSkillsDir();
  const stat = fs.existsSync(target) ? fs.statSync(target) : null;
  if (!stat) throw new Error(`target not found: ${target}`);

  if (stat.isDirectory()) {
    const skillMdPath = path.join(target, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) throw new Error(`${target} is not a skill (no SKILL.md)`);
    const parsed = parseSkillMd(fs.readFileSync(skillMdPath, 'utf-8'));
    const name = pickSafeName(parsed?.frontmatter.name, path.basename(path.resolve(target)));
    const dest = path.join(userDir, name);
    const files = copyTree(target, dest);
    return { name, dir: dest, files };
  }

  // zip package: locate the SKILL.md entry, rebase its dir to userDir/<name>.
  // Works with third-party layouts: SKILL.md at the zip root, a plain folder,
  // or a skills/<name>/ wrapper, independently of frontmatter-vs-folder naming.
  const buf = fs.readFileSync(target);
  const entries = readZip(buf).map(e => ({ ...e, path: e.path.replace(/\\/g, '/') }));
  const candidates = entries
    .filter(e => /(^|\/)SKILL\.md$/.test(e.path))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
  if (candidates.length === 0) throw new Error('zip contains no SKILL.md — not a skill package');
  const pick = candidates[0];
  const rootDir = pick.path.split('/').slice(0, -1).join('/');
  const parsed = parseSkillMd(pick.data.toString('utf-8'));
  const fallback = rootDir ? rootDir.split('/').filter(Boolean).pop()! : path.basename(target).replace(/\.zip$/i, '');
  const name = pickSafeName(parsed?.frontmatter.name, fallback);
  const prefix = rootDir ? rootDir + '/' : '';
  const dest = path.join(userDir, name);
  const destResolved = path.resolve(dest) + path.sep;
  const wanted = entries
    .filter(e => prefix ? e.path.startsWith(prefix) : true)
    .map(e => ({ rel: prefix ? e.path.slice(prefix.length) : e.path, data: e.data }))
    .filter(e => e.rel !== '' && !e.rel.endsWith('/') && !isJunkPath(e.rel));
  // Validate every target path before writing anything: a hostile entry must
  // reject the whole archive, not half-install it.
  const targets = wanted.map(e => {
    const destFile = path.resolve(dest, ...e.rel.split('/'));
    if (!destFile.startsWith(destResolved)) throw new Error(`unsafe zip entry: ${e.rel}`);
    return { destFile, data: e.data };
  });
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t.destFile), { recursive: true });
    fs.writeFileSync(t.destFile, t.data);
  }
  return { name, dir: dest, files: targets.length };
}

function pickSafeName(primary: string | undefined, fallback: string): string {
  const candidate = primary && isSafeSkillName(primary) ? primary : fallback;
  if (!isSafeSkillName(candidate)) {
    throw new Error(`unsafe skill name: ${JSON.stringify(primary || fallback)}`);
  }
  return candidate;
}

// Download an https zip package to a temp file and install it.
export async function installSkillFromUrl(url: string, opts?: { userDir?: string }): Promise<{ name: string; dir: string; files: number }> {
  if (!/^https:\/\//.test(url)) throw new Error('only https URLs are supported');
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 100 * 1024 * 1024) throw new Error('skill package exceeds 100 MB limit');
  const tmp = path.join(os.tmpdir(), `autoclaw-skill-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  fs.writeFileSync(tmp, buf);
  try {
    return installSkill(tmp, opts);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export type RemoveResult = 'removed' | 'not-found' | 'builtin' | 'project';

export function removeSkill(name: string, opts?: { userDir?: string; scopes?: SkillScope[] }): RemoveResult {
  const scopes = opts?.scopes || defaultSkillScopes();
  const { skills } = discoverSkills(scopes);
  const skill = skills.find(s => s.name === name);
  if (!skill) return 'not-found';
  if (skill.source === 'builtin') return 'builtin';
  if (skill.source === 'project') return 'project';
  const userDir = path.resolve(opts?.userDir || userSkillsDir());
  const dir = path.resolve(skill.dir);
  if (!dir.startsWith(userDir + path.sep)) return 'not-found'; // never delete outside the user scope
  fs.rmSync(dir, { recursive: true, force: true });
  return 'removed';
}

// ---- pack (store-upload artifact: zip with skills/<name>/ at its root) ----

export function packSkill(dir: string, outPath?: string): { zipPath: string; fileCount: number; name: string } {
  const abs = path.resolve(dir);
  const skillMdPath = path.join(abs, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) throw new Error(`${abs} is not a skill (no SKILL.md)`);
  const parsed = parseSkillMd(fs.readFileSync(skillMdPath, 'utf-8'));
  const name = parsed?.frontmatter.name || path.basename(abs);
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`unsafe skill name: ${name}`);

  const files: { path: string; data: Buffer }[] = [];
  const walk = (current: string, rel: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (INSTALL_SKIP.has(entry.name) || entry.name === '.DS_Store') continue;
      const child = path.join(current, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child, childRel);
      else if (entry.isFile()) files.push({ path: `skills/${name}/${childRel}`, data: fs.readFileSync(child) });
    }
  };
  walk(abs, '');

  const zipPath = outPath || path.resolve(process.cwd(), `${name}-skill.zip`);
  fs.writeFileSync(zipPath, createZip(files));
  return { zipPath, fileCount: files.length, name };
}
