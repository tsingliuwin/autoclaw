import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// Minimal dependency-free ZIP reader/writer, enough for skill packages:
// deflate + stored entries, UTF-8 names, no zip64, no encryption.
// Writer output is byte-deterministic (fixed DOS timestamp) so identical
// skill content produces identical packages — diffable in CI.

export interface ZipEntry {
  path: string;
  data: Buffer;
}

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- writer ----
export function createZip(files: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 0x21; // fixed 1980-01-01 for deterministic output

  for (const file of files) {
    const name = Buffer.from(file.path.replace(/\\/g, '/'), 'utf8');
    const crc = crc32(file.data);
    const deflated = zlib.deflateRawSync(file.data, { level: 9 });
    const useDeflate = deflated.length < file.data.length;
    const payload = useDeflate ? deflated : file.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(file.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, name]));

    offset += 30 + name.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

// ---- reader ----
export function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip archive (end-of-central-directory not found)');

  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error('corrupt zip archive (bad central directory)');
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    const lhNameLen = buf.readUInt16LE(localOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`unsupported zip compression method ${method} (entry: ${name})`);
    entries.push({ path: name, data });

    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Reject absolute paths, drive letters, '..' traversal, and directory entries.
export function safeJoinZipPath(destDir: string, zipPath: string): string | null {
  const norm = zipPath.replace(/\\/g, '/');
  if (norm.endsWith('/')) return null; // directory entry — created implicitly
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) {
    throw new Error(`unsafe zip entry (absolute path): ${zipPath}`);
  }
  const parts = norm.split('/').filter(s => s.length > 0);
  if (parts.length === 0 || parts.some(s => s === '..')) {
    throw new Error(`unsafe zip entry (path traversal): ${zipPath}`);
  }
  return path.join(destDir, ...parts);
}

// Extract every entry into destDir, creating parents as needed. All paths are
// validated up-front so an unsafe entry (zip-slip) rejects the whole archive
// before a single byte is written.
export function extractZip(buf: Buffer, destDir: string): string[] {
  const entries = readZip(buf);
  const resolved: { dest: string; data: Buffer }[] = [];
  for (const entry of entries) {
    const dest = safeJoinZipPath(destDir, entry.path);
    if (dest === null) continue; // directory entry
    resolved.push({ dest, data: entry.data });
  }
  const written: string[] = [];
  for (const r of resolved) {
    fs.mkdirSync(path.dirname(r.dest), { recursive: true });
    fs.writeFileSync(r.dest, r.data);
    written.push(r.dest);
  }
  return written;
}
