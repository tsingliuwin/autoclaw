// Renders every example in templates/ into output/ via AutoClaw's compiled tools.
// Prerequisite: npm run build   Usage: node examples/render/run.mjs
import { executeToolHandler } from '../../dist/tools/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const T = (name) => fs.readFileSync(path.join(here, 'templates', name), 'utf-8');

// 60-line purchase-order table, forcing the PDF to flow across pages
const rows = Array.from({ length: 60 }, (_, i) => `
  <tr style="border-bottom:1px solid #e2e8f0">
    <td style="padding:10px 14px">SKU-${String(1000 + i)}</td>
    <td style="padding:10px 14px">工业级连接器组件 ${['A型', 'B型', 'C型'][i % 3]}</td>
    <td style="padding:10px 14px;text-align:right">${(i + 1) * 12}</td>
    <td style="padding:10px 14px;text-align:right">¥ ${((i + 1) * 87.5).toFixed(2)}</td>
  </tr>`).join('');

const cases = [
  {
    name: 'og-card',
    tool: 'render_image',
    args: { template: T('og-card.html'), width: 1200, height: 630, output_path: 'output/og-card.png' }
  },
  {
    name: 'social-post',
    tool: 'render_image',
    args: { template: T('social-post.html'), width: 1080, height: 1080, output_path: 'output/social-post.png' }
  },
  {
    name: 'metrics-card',
    tool: 'render_image',
    args: { template: T('metrics-card.html'), width: 1600, height: 900, output_path: 'output/metrics-card.png' }
  },
  {
    name: 'weekly-report',
    tool: 'render_pdf',
    args: {
      template: T('weekly-report.html'),
      title: '服务流量周报 2026-08-31 ~ 09-06',
      output_path: 'output/weekly-report.pdf'
    }
  },
  {
    name: 'badge-svg',
    tool: 'render_image',
    args: { template: T('badge-svg.html'), width: 560, height: 160, format: 'svg', output_path: 'output/badge.svg' }
  },
  {
    name: 'certificate',
    tool: 'render_image',
    args: { template: T('certificate.html'), width: 1414, height: 1000, output_path: 'output/certificate.png' }
  },
  {
    name: 'animation',
    tool: 'render_image',
    args: { template: T('animation.html'), width: 480, height: 480, animation: { duration_ms: 1200, fps: 30 }, output_path: 'output/animation.webp' }
  },
  {
    name: 'emoji',
    tool: 'render_image',
    args: { template: T('emoji.html'), width: 800, height: 300, output_path: 'output/emoji.png' }
  },
  {
    name: 'invoice',
    tool: 'render_pdf',
    args: {
      template: T('invoice.html').replace('{{ROWS}}', rows),
      title: '采购订单 PO-2026-0903',
      footer: '<div style="width:100%;text-align:center;font-size:10px;color:#94a3b8">ACME Ltd · 第 <span class="pageNumber"></span> 页,共 <span class="totalPages"></span> 页</div>',
      output_path: 'output/invoice.pdf'
    }
  }
];

for (const c of cases) {
  const result = await executeToolHandler(c.tool, { ...c.args, output_path: path.join(here, c.args.output_path) }, {});
  console.log(`[${c.name}] ${result.startsWith('Rendered') ? 'OK' : 'FAILED'} — ${result.slice(0, 80)}`);
}
