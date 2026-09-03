---
name: poster-maker
display_name: 海报生成器（社媒封面/分享卡/OG图）
display_name_en: Poster Maker (social covers, share cards, OG images)
description: 生成海报/做海报/公众号封面/小红书配图/朋友圈配图/OG图/分享卡/头图/横幅/banner — social-ready posters, covers and share cards with big-type layouts, brand gradients and platform size specs. Pixel-exact, offline, no browser.
description_zh: 生成社媒视觉物料:海报、公众号封面、小红书/朋友圈配图、OG 分享卡、头图、横幅。大字排版 + 品牌渐变,像素精确、离线毫秒级出图,内置封面/OG/方图等现成模板与尺寸规范。
description_en: Generate social-ready posters, article covers, OG/share cards and banners with big-type layouts and brand gradients. Pixel-exact, offline, milliseconds per render, with ready-made templates and platform size specs.
category: image
version: 1.1.0
author: AutoClaw
---

# 海报生成器

为社媒与营销场景产出视觉物料:海报、公众号封面、小红书/朋友圈配图、OG 分享卡、横幅。本技能在通用渲染引擎之上沉淀了**海报排版规范、平台尺寸表和视觉质量清单**,照着做就能出可发布的图。

## 何时使用

- 用户要"做一张图":海报、封面、配图、分享卡、头图、banner、活动视觉
- 给文章/产品/活动配一张有文字的视觉图(精确文字、品牌色、排版要求)
- 不适用:发票/报价单等文档(用 invoice-maker);纯照片级艺术图(用平台 AI 生图);任意自定义图形(用 code2media 通用技能)

## 平台尺寸速查

| 场景 | 尺寸 | 模板 |
| :--- | :--- | :--- |
| 小红书封面(3:4 占屏最大) | 1080 × 1440 | `social-post.html` 改尺寸 |
| 朋友圈/通用方图 | 1080 × 1080 | `social-post.html` |
| 公众号首图封面 | 900 × 383 | `cover.html` |
| 博客/官网 OG 分享卡 | 1200 × 630 | `og-card.html` |
| 竖版海报(印刷感) | 1080 × 1440 | 改方图模板尺寸即可 |
| 视频封面 | 1280 × 720 | 改封面模板尺寸即可 |

> 小红书只支持 1:1、3:4、4:3 三种比例,3:4 观感最好;多图笔记的配图先统一尺寸,否则系统自动补白边。

## 场景速查

不同场景的构图、配色和视觉重心完全不同,先对号入座(信息层级与易错点详见 `@references/scenario-playbook.md`):

| 场景 | 构图 | 配色 | 第一视觉 |
| :--- | :--- | :--- | :--- |
| 促销/电商 | 左对齐或强分裂 | 红橙黄高饱和 | 折扣/价格数字 |
| 活动/会议 | 居中 | 主题色+深底 | 活动名 |
| 招聘 | 左对齐 | 品牌蓝/绿 | 岗位名+薪资 |
| 餐饮/美食 | 图左文右 | 暖色(红橙黄) | 菜品实拍 |
| 节日/节气 | 居中 | 传统配色 | 节日符号+大字 |
| 知识/课程 | 左对齐 | 低饱和+强调色 | 收益式标题 |
| 地产/政务 | 居中 | 蓝金/红金/深灰 | 机构名或主标 |
| 品牌/发布 | 大面积留白 | 深色高级感 | 产品本身 |

## 工作流程

1. **定场景、选模板**:先确定海报场景(促销/活动/招聘/节日…),按上方速查表定构图与配色;再从 `templates/` 选最接近的,把文案/配色/品牌元素替换掉。没有合适的就从零写。
2. **写 HTML**:语法三条铁律(详见 `@references/syntax-guide.md`):
   - Tailwind 工具类写 **`tw` 属性**(`class` 不编译 Tailwind);
   - 用 v4 规范名(渐变 `bg-linear-to-br`,不是 `bg-gradient-to-br`);
   - 根元素撑满画布 `tw="w-full h-full ..."`。
3. **渲染**:
   ```bash
   node "<技能目录>/scripts/render.mjs" --html poster.html -o poster.png --width 1080 --height 1080
   ```
4. **过质量清单**(下方),不满意改了重跑——渲染是毫秒级的。

## 海报视觉质量清单

- **文字层级 ≤ 3 级**:主标题(最大)/副标题/说明文字,一眼能分清主次;主标题占画面高度 ≥ 1/5
- **留白要狠**:内边距不小于画布短边的 5%(如 1080 宽至少 54px);元素之间用 `gap`/`mt` 拉开呼吸感
- **对比度**:文字与背景必须有足够对比;浅色文字配深色渐变,或深色文字配浅色底;文字压图三招(挪干净处/背景压暗/色块描边)见场景手册
- **配色 ≤ 3 种**:主色+辅助色+强调色;拿不准就用品牌色的深浅渐变家族
- **分组要明显**:相关元素贴近、无关元素拉远,组间距差距 ≥ 2 倍,一眼扫出信息块
- **中文不斜体**(斜体在无衬线中文里很丑),强调用加粗/变色/字号
- **一图一重点**:不要把所有信息塞进一张图;胶囊标签 ≤ 3 个
- **品牌一致性**:有品牌色/Logo 就放角标位,颜色用品牌色的渐变家族
- 字体:`style="font-family:msyh,NotoSansCJK-Regular,wqy-zenhei"`,离线环境 Emoji 保持纯文本

## 批量与变体

一个活动要 5 种尺寸、10 个城市的本地化海报?同一模板改文案/尺寸循环调用脚本即可,输出确定性保证同模板永远同品质。渲染完可用 `identify`(ImageMagick)或直接看文件大小做粗校验。

## 环境要求

Node.js >= 20.19;首次运行自动安装 takumi-js/takumi-pdf(一次性,需网络)。容器内中文需字体包(`font-noto-cjk`)。需要完全自定义的非海报图形时,用 `code2media` 通用技能。
