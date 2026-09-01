// Tool outputs are fed back into the model context, so they must be bounded.
// Two independent limits apply — whichever is hit first wins:
//   - line limit (default 2000 lines)
//   - byte limit (default 50KB, counted as UTF-8 bytes)
export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024;

export interface TruncateOptions {
  maxLines?: number;
  maxBytes?: number;
}

export interface TruncationResult {
  content: string;
  truncated: boolean;
  totalLines: number;
  totalBytes: number;
  emittedLines: number;
  emittedBytes: number;
}

export function truncateOutput(content: string, options: TruncateOptions = {}): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const totalBytes = Buffer.byteLength(content, 'utf8');
  const lines = content.length === 0 ? [] : content.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return { content, truncated: false, totalLines, totalBytes, emittedLines: totalLines, emittedBytes: totalBytes };
  }

  let emittedLines = 0;
  let emittedBytes = 0;
  const kept: string[] = [];
  for (const line of lines) {
    if (kept.length + 1 > maxLines) break;
    const lineBytes = Buffer.byteLength(line, 'utf8') + (kept.length < lines.length - 1 ? 1 : 0);
    if (emittedBytes + lineBytes > maxBytes) break;
    kept.push(line);
    emittedLines++;
    emittedBytes += lineBytes;
  }

  const notice = `[Truncated: showing ${emittedLines} of ${totalLines} lines, ${emittedBytes} of ${totalBytes} bytes]`;
  const out = kept.length > 0 ? kept.join('\n') + '\n' + notice : notice;
  return { content: out, truncated: true, totalLines, totalBytes, emittedLines, emittedBytes };
}
