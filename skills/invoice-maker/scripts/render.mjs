#!/usr/bin/env node
// HTML -> image / SVG / paged PDF / animation, powered by Takumi (no browser).
// Self-contained CLI for agent skills: auto-installs takumi-js/takumi-pdf on
// first run, renders an HTML fragment file to the requested output format.
//
// Usage:
//   node render.mjs --html card.html -o card.png --width 1200 --height 630
//   node render.mjs --html badge.html -o badge.svg
//   node render.mjs --html invoice.html --pdf -o invoice.pdf [--size a4] [--title "t"] [--footer '<div>...</div>']
//   node render.mjs --html anim.html --animation webp -o anim.webp [--fps 30] [--duration 1200]
//   node render.mjs --html card.html -o card.png --font /path/Font.ttf [--font ...] | --no-fonts
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const MIN_NODE = 20;
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < MIN_NODE) {
  console.error(`Error: Node.js >= ${MIN_NODE}.19 required, found ${process.versions.node}.`);
  process.exit(1);
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(SCRIPT_DIR, 'package.json'));

function ensureDependencies() {
  try {
    require.resolve('takumi-js');
    require.resolve('takumi-pdf');
    return;
  } catch { /* fall through to install */ }
  console.error('First run: installing takumi-js and takumi-pdf (one-time, needs network)...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['install', '--no-fund', '--no-audit', 'takumi-js', 'takumi-pdf'], {
    cwd: SCRIPT_DIR, stdio: 'inherit', shell: process.platform === 'win32'
  });
  // Re-check after install so failures surface as a clear error.
  try {
    require.resolve('takumi-js');
    require.resolve('takumi-pdf');
  } catch {
    error('dependency install finished but takumi-js/takumi-pdf still not resolvable; check network / npm registry access.');
  }
}
ensureDependencies();

const { render, renderSvg, renderAnimation } = await import('takumi-js');
const { render: renderPdf } = await import('takumi-pdf');

// ---- args ----
const args = process.argv.slice(2);
const ALIASES = { output: ['o'] };
function opt(name) {
  for (const key of [name, ...(ALIASES[name] || [])]) {
    const token = key.length === 1 ? `-${key}` : `--${key}`;
    const i = args.indexOf(token);
    if (i !== -1) return args[i + 1];
  }
  return undefined;
}
function flag(name) {
  return args.includes(`--${name}`);
}
function error(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

const htmlFile = opt('html');
const output = opt('output');
if (!htmlFile) error("'--html <file>' is required (an HTML fragment file to render).");
if (!output) error("'-o/--output <file>' is required.");
const template = fs.readFileSync(htmlFile, 'utf-8');
if (!template.trim()) error(`${htmlFile} is empty.`);

const cssFile = opt('css');
const css = cssFile ? fs.readFileSync(cssFile, 'utf-8') : undefined;

// ---- fonts: auto-detect common system fonts unless --no-fonts / --font given ----
const COMMON_FONT_PATHS = [
  '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/usr/share/fonts/noto/NotoColorEmoji.ttf',
  '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
  '/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf',
  'C:\\Windows\\Fonts\\msyh.ttc',
  'C:\\Windows\\Fonts\\simhei.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
  'C:\\Windows\\Fonts\\seguiemj.ttf',
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/System/Library/Fonts/Helvetica.ttc',
  '/System/Library/Fonts/Apple Color Emoji.ttc',
];

function resolveFonts() {
  if (flag('no-fonts')) return [];
  const fontOpts = args.flatMap((a, i) => (a === '--font' ? [args[i + 1]] : []));
  const paths = fontOpts.length > 0 ? fontOpts : COMMON_FONT_PATHS.filter(p => fs.existsSync(p));
  const fonts = [];
  for (const p of paths) {
    try {
      fonts.push({ name: path.basename(p).replace(/\.(ttf|otf|ttc|woff2?)$/i, ''), data: fs.readFileSync(p) });
    } catch { /* skip unreadable */ }
  }
  return fonts;
}
const fonts = resolveFonts();

const width = Number(opt('width')) || 1200;
const height = Number(opt('height')) || 630;
const quality = opt('quality') ? Number(opt('quality')) : undefined;

try {
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });

  // ---- PDF mode ----
  if (flag('pdf')) {
    const options = { size: (opt('size') || 'a4').toLowerCase(), fonts };
    if (css) options.css = css;
    if (flag('landscape')) options.landscape = true;
    if (opt('title')) options.metadata = { title: opt('title') };
    if (opt('footer')) options.footer = opt('footer');
    if (opt('header')) options.header = opt('header');
    if (flag('outline')) options.outline = true;
    const VALID_SIZES = ['a3', 'a4', 'a5', 'b4', 'b5', 'letter', 'legal', 'ledger'];
    if (!VALID_SIZES.includes(options.size)) {
      error(`invalid page size '${options.size}'. Supported: ${VALID_SIZES.join(', ')}.`);
    }
    const bytes = await renderPdf(template, options);
    fs.writeFileSync(output, Buffer.from(bytes));
    console.log(`OK PDF ${bytes.length} bytes -> ${output}`);
    process.exit(0);
  }

  // ---- animation mode ----
  const animFormat = opt('animation');
  if (animFormat) {
    const VALID_ANIM = ['webp', 'gif', 'apng'];
    const fmt = animFormat.toLowerCase();
    if (!VALID_ANIM.includes(fmt)) error(`invalid animation format '${animFormat}'. Supported: ${VALID_ANIM.join(', ')}.`);
    const bytes = await renderAnimation({
      width, height,
      fps: Number(opt('fps')) || 30,
      format: fmt,
      scenes: [{ node: template, durationMs: Number(opt('duration')) || 1000 }],
      fonts, ...(css ? { css } : {})
    });
    fs.writeFileSync(output, Buffer.from(bytes));
    console.log(`OK animation ${fmt.toUpperCase()} ${bytes.length} bytes -> ${output}`);
    process.exit(0);
  }

  // ---- static image / SVG mode ----
  const format = (opt('format') || path.extname(output).replace('.', '') || 'png').toLowerCase();
  if (format === 'svg') {
    const svg = await renderSvg(template, { width, height, fonts, ...(css ? { css } : {}) });
    fs.writeFileSync(output, svg, 'utf-8');
    console.log(`OK SVG ${Buffer.byteLength(svg)} bytes -> ${output}`);
  } else {
    const VALID = ['png', 'jpeg', 'webp'];
    if (!VALID.includes(format)) error(`invalid format '${format}'. Supported: png, jpeg, webp, svg (or use --pdf / --animation).`);
    const options = { width, height, format, fonts, ...(css ? { css } : {}) };
    if (quality != null && (format === 'jpeg' || format === 'webp')) options.quality = quality;
    const bytes = await render(template, options);
    fs.writeFileSync(output, Buffer.from(bytes));
    console.log(`OK ${format.toUpperCase()} ${width}x${height} ${bytes.length} bytes -> ${output}`);
  }
} catch (err) {
  console.error(`Error rendering: ${err?.message || err}`);
  process.exit(1);
}
