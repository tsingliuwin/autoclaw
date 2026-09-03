---
name: invoice-maker
display_name: 发票生成器（报价单/收据/采购单）
display_name_en: Invoice Maker (quotes, receipts, purchase orders)
description: Generate formal business documents as paged PDFs — invoices, quotes, purchase orders, receipts, statements — with proper tables, tax lines, page numbers and bilingual layouts. Use when the user wants to 开发票/生成发票/报价单/收据/采购单/对账单/账单/付款通知 or make an invoice/quote/receipt PDF.
description_zh: 生成正式商务票据 PDF:发票、报价单、收据、采购单、对账单、账单。金额右对齐、税行规范、表格跨页表头重复、页码页脚,中英双语排版可选。离线毫秒级渲染,支持按订单数据批量出票。
description_en: Generate formal business document PDFs — invoices, quotes, purchase orders, receipts, statements. Right-aligned amounts, tax lines, repeating table headers across pages, page-number footers, optional bilingual layouts. Offline, batch-ready.
category: office
version: 1.0.0
author: AutoClaw
---

# 发票生成器

把订单/交易数据变成正式的商务票据 PDF:发票、报价单、收据、采购单、对账单、账单。本技能沉淀了**票据的版式结构、金额规范和批量开票模式**,产出的 PDF 文字可选中、字体已内嵌,可直接邮件发送或归档。

## 何时使用

- 用户要"开/生成"一张正式单据:发票、报价单、收据、采购单、对账单、账单、付款通知
- 从订单表(CSV/JSON)批量出票
- 不适用:非票据类报告(运营周报等用 code2media);证书奖状(用 code2media 模板);艺术排版海报(用 poster-maker)

## 版式结构(票据的骨架)

```
[抬头区]   公司名 + 单据类型/编号        日期/有效期/联系人(右对齐)
[客户区]   致:客户名 + 一句话背景说明(浅底色块)
[明细表]   # | 项目 | 规格说明 | 数量 | 单价 | 小计(表头浅灰底)
[合计区]   小计 → 税 → 含税总计(右对齐,总计最大最粗)
[条款区]   付款条款/有效期/免责,小号灰字,可中英双语
```

参考 `templates/`:`invoice.html`(采购订单,60 行明细跨页示例)、`quote.html`(报价单)。

## 金额与排版规范(硬性)

- **金额一律右对齐**,带千分位(`¥ 104,940.00`);数量/单价/小计列都用 `text-align:right`
- **总计行最大最粗**,小计/税行用灰色小一号;税行单独列出,不和总计混算
- 表格行加 `style="border-bottom:1px solid #e2e8f0"`,表头浅灰底 `background:#f1f5f9`
- 表格行加 `break-inside:avoid` 防跨页劈行;`<thead>` 会跨页自动重复,明细多也不怕
- 页脚固定放页码:`第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页`
- 编号规则清晰可见(如 `QU-2026-0912`),日期用完整格式;中英双语条款便于跨境
- 渲染命令:

```bash
node "<技能目录>/scripts/render.mjs" --html invoice.html --pdf -o invoice.pdf --size a4 \
  --title "发票 INV-2026-0001" \
  --footer '<div style="width:100%;text-align:center;font-size:10px;color:#94a3b8">第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</div>'
```

## 批量开票(swarm 模式)

按订单表出票:循环读每行数据 → 把 `templates/invoice.html` 的抬头/明细/合计替换成该订单 → 渲染为 `invoices/<订单号>.pdf`。单张约几十毫秒,千张订单分钟级完成;输出确定,重跑同数据得到同文件。列宽字段(公司名/品名)超长时截断或换行,不要溢出表格。

## 交付前检查

- [ ] 总计 = 明细之和(含税计算正确,税率单列)
- [ ] 单据编号、双方名称、日期完整
- [ ] 明细超过一页时:第 2 页起表头是否重复、页码是否正确
- [ ] 中文无豆腐块(容器需 `font-noto-cjk` 字体包,或 `--font` 指定)
- [ ] PDF 文字可选中、可搜索(本技能默认满足)

## 环境要求

Node.js >= 20.19;首次运行自动安装 takumi-js/takumi-pdf(一次性,需网络)。非票据的自定义文档用 `code2media` 通用技能。
