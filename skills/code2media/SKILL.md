---
name: code2media
display_name: 代码转多媒体（HTML → 图片/PDF/动图）
display_name_en: Code to Media (HTML → images/PDF/animations)
description: Universal renderer — turn any HTML into pixel-perfect PNG/JPEG/WebP images, vector SVG, paged PDFs and animated WebP/GIF. Offline, no browser. Use when the user wants to 把内容/代码/数据变成图片或PDF, 生成图片/OG图/徽章/数据卡片/动图, 生成PDF/报告/发票/工单, or render HTML to image or PDF. For deep scenario optimization see sibling skills (posters, invoices, certificates).
description_zh: 通用多媒体渲染:把任意 HTML 变成精确的图片(PNG/JPEG/WebP)、矢量 SVG、分页 PDF 和动图(WebP/GIF)。离线渲染,无需浏览器,毫秒级出图,文字排版 100% 精确。通用兜底;海报/发票/证书等具体场景有专属技能时优先用专属技能。
description_en: Universal multimedia renderer — any HTML becomes precise images (PNG/JPEG/WebP), vector SVG, paged PDFs and animations (WebP/GIF). Offline, no browser, millisecond-per-render. General fallback; prefer dedicated scenario skills (posters, invoices, certificates) when available.
category: image
version: 1.2.0
author: AutoClaw
---

# 代码转多媒体

把任意 HTML 变成可直接交付的多媒体:图片、矢量 SVG、分页 PDF、动图。底层是 Takumi 渲染引擎(纯计算,无浏览器、无 AI、无网络依赖),**你写什么 HTML,输出就是什么像素**——文字、排版、颜色 100% 精确,相同输入永远得到相同输出。

这是**通用渲染技能**:处理任意自定义图形与文档需求。海报、发票、证书等高频场景有各自独立优化的专属技能,任务精确匹配场景时优先用专属技能;没有匹配场景、或需要完全自定义的产物时,用本技能。

## 何时使用

- 用户要**自定义/长尾**的图形与文档:上面场景技能没覆盖的尺寸、结构、风格,数据驱动的图表卡片,一次性版式
- 用户要**动图**:加载动画、动态徽章、社媒动图
- 任务明确命中高频场景时优先用专属技能(它们有独立的排版规范与质量清单):海报/封面/分享卡 → `poster-maker`;发票/报价单/收据/采购单 → `invoice-maker`
- 不适用:艺术创作、照片类图像(用平台的 AI 生图能力);截图现实网页(用浏览器/截图工具)

## 工作流程

1. **选起点**:优先修改 `templates/` 里的现成模板(见下方清单);没有合适的再从零写。语法规则必须遵守 `@references/syntax-guide.md`,最重要的三条:
   - Tailwind 工具类写在 **`tw` 属性**里(`class` 属性不编译 Tailwind,只匹配普通 CSS 选择器)
   - 用 Tailwind v4 规范名(渐变是 `bg-linear-to-br`,不是 v3 的 `bg-gradient-to-br`)
   - 根元素撑满画布:`tw="w-full h-full ..."`
2. **写出 HTML 片段文件**(不需要完整 HTML 文档),数据直接填进模板。
3. **运行渲染脚本**:
   ```bash
   node "<技能目录>/scripts/render.mjs" --html card.html -o card.png --width 1200 --height 630
   ```
   首次运行会自动安装 takumi-js / takumi-pdf(一次性,需网络);之后完全离线。
4. **校验并交付**:确认脚本输出 `OK` 与文件存在,把输出路径告诉用户。渲染是毫秒级的,改模板重渲染的成本几乎为零——效果不满意就直接改了再跑。

## 命令速查

```bash
# 静态图片(png/jpeg/webp),尺寸自定
node scripts/render.mjs --html card.html -o card.png --width 1200 --height 630
# 矢量 SVG
node scripts/render.mjs --html badge.html -o badge.svg --width 560 --height 160
# 分页 PDF(a3/a4/a5/b4/b5/letter/legal/ledger,自动分页,可加页脚/标题/书签)
node scripts/render.mjs --html invoice.html --pdf -o invoice.pdf --size a4 --title "采购订单" \
  --footer '<div style="width:100%;text-align:center;font-size:10px;color:#94a3b8">第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</div>'
# 动图(CSS @keyframes 按时间采样,输出 webp/gif/apng)
node scripts/render.mjs --html anim.html --animation webp -o anim.webp --width 480 --height 480 --fps 30 --duration 1200
# 附加样式表 / 指定字体 / 跳过字体
node scripts/render.mjs --html card.html -o card.png --css extra.css
node scripts/render.mjs --html card.html -o card.png --font /path/MyFont.ttf
node scripts/render.mjs --html card.html -o card.png --no-fonts   # 纯拉丁文字时更快
```

JPEG/WebP 可加 `--quality 80`。PDF 表格加 `style="break-inside:avoid"` 防止行被劈开,`<thead>` 会跨页自动重复。

## 模板清单(templates/)

通用示例模板,展示引擎能力面。海报/封面/OG 图在 `poster-maker` 技能,发票/报价单在 `invoice-maker` 技能。

| 文件 | 用途 | 建议参数 |
| :--- | :--- | :--- |
| `metrics-card.html` | KPI 数据指标卡(1600x900) | 图片 |
| `certificate.html` | 结业证书/奖状(1414x1000,金色边框) | 图片 |
| `weekly-report.html` | 单页 A4 运营周报(KPI + 纯 div 柱状图) | `--pdf` |
| `badge.html` | SVG 徽章/发布标签(560x160) | 图片(输出 .svg) |
| `animation.html` | 品牌 Logo 脉冲动画(480x480) | `--animation webp` |

## 批量场景

要批量生成(如 200 份证书、按订单出发票)时:写一个循环脚本,读数据(_CSV/JSON_),把每条数据填进同一份模板后循环调用 `render.mjs`。单张渲染约几十毫秒,200 份几秒完成;输出确定性意味着同一份数据永远得到同样的文件。

## 环境要求与故障排查

- Node.js >= 20.19。
- 首次运行自动 `npm install`(安装进 scripts/ 目录),之后离线可用;若目标环境完全断网,需在有网环境预装后再拷贝,或提前执行一次安装。
- 中文/Emoji 显示为方块(豆腐块):容器缺字体。安装 `font-noto-cjk`(Alpine)或 `fonts-noto-cjk`(Debian)后重跑;或用 `--font` 指定字体文件。详见 `@references/syntax-guide.md`。
- Emoji 默认经 Twemoji CDN 在线获取;完全离线的环境让模板保持纯文本。
- 渲染报错信息以 `Error` 开头输出在 stderr,按提示修正模板后重试。
