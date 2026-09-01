import { getBashPath, resolveShellType, execShellCommand } from './dist/shell.js';
console.log('bashPath:', getBashPath());
console.log('type:', resolveShellType({}));
const t0 = Date.now();
const r = await execShellCommand('node -e "setTimeout(()=>{},10000)"', { timeoutMs: 500, maxBuffer: 1024*1024 });
console.log('resolved at', Date.now()-t0, 'ms; timedOut:', r.timedOut, 'stdout:', JSON.stringify(r.stdout.slice(0,80)));
process.exit(0);
