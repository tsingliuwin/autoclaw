# HTML 模板语法指南

渲染引擎是 Takumi(Rust 排版引擎的 Node 绑定):解析 HTML 片段 → taffy 布局(Flexbox/Grid/block/float)→ 文字排版(含中日韩、RTL、emoji)→ 合成输出。本指南只列**容易踩坑的规则**,完整 CSS 支持范围以引擎能力为准。

## 1. 样式的三条通路

| 方式 | 写法 | 说明 |
| :--- | :--- | :--- |
| `tw` 属性 | `<div tw="w-full h-full bg-blue-500">` | **Tailwind v4 工具类的唯一入口** |
| 内联 style | `<div style="font-size:32px;color:#fff">` | 标准 CSS,最直接 |
| `<style>` 块 | `<style>.card{background:#0ea5e9}</style>` + `class="card"` | 常规 CSS 选择器,支持 `:is()`、`::before` 等 |

**关键陷阱**:
- Tailwind 工具类放在 `class` 属性里**不会编译**——整块样式静默失效(背景全透明)。工具类永远写 `tw`。
- `class` 属性的用途是配合 `<style>` 块里的普通选择器。

## 2. Tailwind v4 命名

用 v4 规范名,v3 旧名不识别:
- 渐变:`bg-linear-to-br`(不是 `bg-gradient-to-br`)+ `from-blue-600 to-indigo-900`
- 透明度修饰符可用:`bg-white/10`、`bg-blue-500/20`
- 常用:`w-full h-full flex flex-col items-center justify-center gap-4 p-16 rounded-2xl rounded-full text-6xl font-bold leading-tight tracking-widest mt-10 space-y-2`
- 任意值:`text-[10px]`、`w-[220px]`

## 3. 布局要点

- 根元素必须撑满画布:`tw="w-full h-full"`,否则内容按自身高度渲染。
- 布局引擎:Flexbox、CSS Grid、block、inline、float、`calc()`、绝对定位、z-index 均支持。
- `w-14 h-14 w-36 text-6xl` 等标准尺寸刻度可用;复杂尺寸用任意值或内联 style。

## 4. 字体

引擎内置仅一个拉丁兜底字体;**中日韩、Emoji 必须注册字体**。渲染脚本自动探测常见系统字体(Windows: msyh/simhei/arial/seguiemj;macOS: PingFang/Hiragino;Linux: Noto CJK/WQY + Noto Emoji),注册后的字体族名 = 文件名去扩展名(如 `msyh`、`NotoSansCJK-Regular`)。

- 模板里跨平台建议写字体栈:`style="font-family:msyh,NotoSansCJK-Regular,NotoSansCJKsc-Regular,wqy-zenhei"`
- 不指定时使用注册顺序作为回退链,注册了 CJK 字体就能显示中文。
- 容器缺字体 → 中文显示方块:Alpine `apk add font-noto-cjk font-noto-emoji`;Debian `apt-get install fonts-noto-cjk fonts-noto-color-emoji`。或 `--font /路径/字体.ttf` 显式注册。
- Emoji 默认走 Twemoji CDN 在线取图(需网络);离线环境模板写纯文本。
- 等宽/代码:`font-family:monospace` 若未注册对应字体,回退到内置拉丁字体。

## 5. 不支持 / 受限

- **不执行 JavaScript**——图表用纯 `div` 条形图拼,数据直接写进 HTML。
- CSS 是 Chrome 的子集:`backdrop-filter`、blend modes 支持于图片模式;**PDF 模式不支持** `filter: blur()`、`drop-shadow()`、`backdrop-filter`。
- 远程图片(`<img src="https://...">`)需要网络;离线场景把图片以本地文件方式避开或不用图。
- PDF 模式不支持 CSS `@page` 规则——页面尺寸/边距用命令行参数(`--size`、`--landscape`)控制。

## 6. PDF 分页

- 内容超过一页自动分页;`break-before:page`、`break-after:page`、`break-inside:avoid` 控制断点(表格行建议 `break-inside:avoid`)。
- `<thead>` 跨页自动重复;孤行寡行默认保护。
- 页眉页脚用 `--header` / `--footer` 参数传入 HTML 片段,内部可用 `<span class="pageNumber"></span>`、`<span class="totalPages"></span>` 注入页码计数(可加 `cjk-decimal` 等计数样式类)。
- `--title` 写入 PDF 元数据;`--outline` 从 h1-h6 生成书签。

## 7. 动画

- 在 `<style>` 里写 `@keyframes`,元素上加 `animation: 名称 时长 linear infinite`。
- 脚本对整个场景按 `--fps` 采样 `--duration` 毫秒,输出动画 WebP/GIF/APNG。
- 变换(rotate/scale/translate)、透明度渐变均可采样;两个以上元素错开 `delay` 能做出层次感(参考 `templates/animation.html`)。

## 8. 确定性与批量

相同输入(模板+参数+字体)永远产出字节一致的文件。批量生成时:循环读数据 → 数据填入模板 → 调 `render.mjs` → 输出按数据键命名。单张几十毫秒,失败重跑零成本。
