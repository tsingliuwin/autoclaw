# 渲染案例 (`render_image` / `render_pdf`)

AutoClaw 确定性渲染工具的可运行案例集。每个案例 = 一个真实应用场景 + agent 实际使用的模板 + 已提交的渲染效果。

跑通全部案例(需先 `npm run build`):

```bash
node examples/render/run.mjs
```

> 模板使用 `tw` 属性书写 Tailwind v4 工具类(普通 `class` 属性只匹配常规 CSS 选择器);文字依赖自动探测的系统字体——容器内渲染中文请安装 `font-noto-cjk`(Alpine)或 `fonts-noto-cjk`(Debian)。

## 案例列表

### 1. OG 分享卡 — `output/og-card.png`
博客/社媒分享图:品牌角标 + 大标题 + 胶囊标签。最经典的 SEO 场景,每篇文章一张。
```bash
autoclaw "读取 content/posts/ 下每篇 .md 的标题和摘要,为每篇文章渲染一张 OG 分享图(1200x630)到 public/og/" -y -n
```
![OG 分享卡](output/og-card.png)

### 2. 社媒方图海报 — `output/social-post.png`
1080x1080 方图,适配小红书/朋友圈/Instagram——品牌渐变底 + 超大中文标题排版。
```bash
autoclaw "渲染一张 1080x1080 的社媒海报推广我们的自动化周刊:大字号钩子标题,品牌渐变背景" -y -n
```
![社媒方图](output/social-post.png)

### 3. 数据指标卡 — `output/metrics-card.png`
周报/看板/群推送用的 KPI 卡片——数字精确,没有 AI 随机性。
```bash
autoclaw "汇总本周自动化运行数据,生成一张 KPI 指标卡(1600x900),含任务总数、成功率、平均耗时、节省工时" -y -n
```
![数据指标卡](output/metrics-card.png)

### 4. 周报 PDF — `output/weekly-report.pdf`
cron/CI 里的定时运营报告:单页 A4,KPI 行 + 纯 `div` 搭的柱状图——无 JS、无图表库。输出确定,CI 可以对两次渲染逐字节 diff。
```bash
autoclaw "汇总本周 nginx 访问日志,生成一页 A4 的 PDF 流量周报(含指标表格),保存为 report.pdf" -y -n
```

### 5. 矢量徽章 — `output/badge.svg`
SVG 输出无限缩放不失真——文档、README 里使用的盾牌、徽章、发布标签。
```bash
autoclaw "为 render_pdf 渲染一枚发布徽章,SVG 格式保存到 assets/badge.svg" -y -n
```
![徽章](output/badge.svg)

### 6. 结业证书 — `output/certificate.png`
按名单批量生成个性化证书。实测约 67ms/份,200 人名单几秒出完。
```bash
autoclaw "读取 attendees.json,为每位学员渲染一张结业证书(1414x1000)保存到 certs/,编号从 AC-2026-0001 起" -y -n
```
![结业证书](output/certificate.png)

### 7. 动图 — `output/animation.webp`
CSS `@keyframes` 按时间采样输出动画 WebP(也支持 GIF/APNG)——加载指示、社媒动态内容、简单动效。1.2 秒 30fps 约 167KB,离线渲染。
```bash
autoclaw "渲染一段 480x480 的品牌循环动画:Logo 外圈脉冲扩散,时长 1.2 秒、30fps,输出动画 WebP" -y -n
```
![动图](output/animation.webp)

### 8. 多页采购订单 — `output/invoice.pdf`
60 行中文表格自动流转为 3 页 A4:表头跨页重复、页脚带 `第 X 页 / 共 Y 页` 计数、文档标题写入 PDF 元数据。约 400ms 渲染完成,全程无浏览器。
```bash
autoclaw "读取 orders.csv,为每个订单生成 PDF 发票保存到 invoices/(A4,页脚带页码),然后把每张发票邮件发送给该行记录的客户邮箱" -y
```

### 9. Emoji 行为说明 — `output/emoji.png`
Emoji 默认经 Twemoji CDN 在线获取、全彩渲染;完全离线的环境请让模板保持纯文本(中日韩文字走本地字体,不受影响)。
![Emoji](output/emoji.png)

## 真实 agent 产物 — `agent-run/`

一次无头运行、真实模型、零人工修改——agent 自行规划设计、调用两个新工具并验证输出:

```bash
autoclaw "渲染一张 AutoClaw v1.4 发布的 OG 图(深色渐变,标题 AutoClaw v1.4),并用 render_pdf 生成一页 A4 简报介绍两个新渲染工具" -y -n
```

| 文件 | 说明 |
| :--- | :--- |
| `agent-run/agent-og.png` | agent 自主设计并渲染的 OG 图 |
| `agent-run/agent-brief.pdf` | agent 撰写排版的单页 A4 简报 |
