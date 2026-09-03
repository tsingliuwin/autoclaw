import * as fs from 'fs';
import * as path from 'path';

// Font files registered by the Takumi render tools when a call does not pass
// font_paths explicitly. Takumi ships only a last-resort Latin font, so without
// these, CJK and emoji render as tofu in headless containers. Paths mirror the
// font detection in screenshot.ts and cover Alpine/Debian/Arch packaging plus
// Windows and macOS system fonts.
const COMMON_FONT_PATHS: string[] = [
  // Linux — CJK
  '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  // Linux — emoji
  '/usr/share/fonts/noto/NotoColorEmoji.ttf',
  '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
  '/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf',
  // Windows — msyh.ttc (Microsoft YaHei) covers CJK, seguiemj.ttf covers emoji
  'C:\\Windows\\Fonts\\msyh.ttc',
  'C:\\Windows\\Fonts\\simhei.ttf',
  'C:\\Windows\\Fonts\\arial.ttf',
  'C:\\Windows\\Fonts\\seguiemj.ttf',
  // macOS
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/System/Library/Fonts/Helvetica.ttc',
  '/System/Library/Fonts/Apple Color Emoji.ttc',
];

export interface RenderFont {
  name?: string;
  data: Buffer;
}

export interface ResolvedFonts {
  fonts: RenderFont[];
  families: string[];
  skipped: string[];
}

// font_paths === undefined -> auto-detect common system fonts
// font_paths === []        -> skip font loading entirely (built-in Latin font)
export function resolveFontLoaders(fontPaths?: string[]): ResolvedFonts {
  const paths = fontPaths === undefined
    ? COMMON_FONT_PATHS.filter(p => fs.existsSync(p))
    : fontPaths;

  const fonts: RenderFont[] = [];
  const skipped: string[] = [];
  for (const p of paths) {
    try {
      const data = fs.readFileSync(p);
      const name = path.basename(p).replace(/\.(ttf|otf|ttc|woff2?)$/i, '');
      fonts.push({ name, data });
    } catch {
      skipped.push(p);
    }
  }

  return { fonts, families: fonts.map(f => f.name!), skipped };
}

// One-line summary for tool results so the agent knows which family names it
// can reference via font-family in templates.
export function describeFonts(resolved: ResolvedFonts): string {
  if (resolved.families.length === 0) {
    return 'no extra fonts registered (built-in Latin font only; CJK/emoji need font_paths)';
  }
  const parts = [`registered: ${resolved.families.join(', ')}`];
  if (resolved.skipped.length > 0) {
    parts.push(`skipped (unreadable): ${resolved.skipped.join(', ')}`);
  }
  return parts.join('; ');
}
