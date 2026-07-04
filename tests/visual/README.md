# Visual QA — docs 需求站质控（WTJ-20260703-003，视觉/UX 轨）

被测对象: `docs/index.html`（TL 活跃修改中的移动目标）。
所有用例只测需求层的沟通效果与排版结果，不耦合具体 DOM/class，正式版重构后直接复用。
统一用例索引（DOCQC-001..012，含脚本轨）见 `tests/e2e/docqc-cases.md`。

## 截图流程（所有视觉用例的统一前置）

```bash
python3 tests/visual/scripts/capture_docs.py
```

脚本每次运行先**删除并重建**输出目录（陈旧 segment/截图绝不允许被拿去判读），
并把被测文档字节的 sha256 写入 `probes.json` 的 `docSha256`，判读结论可以据此
绑定到确切的文档版本。

产出（`tests/reports/docs-qc/`，git 忽略）：

| 文件 | 用途 |
| --- | --- |
| `desktop-first-screen.png` (1440x900) | DOCQC-008 |
| `mobile-first-screen.png` (390x844) | DOCQC-011 |
| `{desktop,mobile}-full-page.png` | 存档/对比/对比度探针的取色源 |
| `segments/{desktop,mobile}-seg-NN.png` | 逐段喂给视觉子代理（整页图太高，视觉模型读不了） |
| `probes.json` | 探针结果（gate + advisory）、截图清单、docSha256 |
| `GATE_FAILED`（仅硬门禁失败时） | 标记文件：截图已隔离，禁止判读 |
| `quarantine/`（仅硬门禁失败时） | 被隔离的全部截图与 segments |

## 两级门禁语义（重要）

探针分两级，写在 probes.json 的 `gate` 与 `advisory` 两段：

1. **硬门禁（截图有效性）**：水平溢出、破图/图片数不足、失败请求、pageerror、
   segment 触顶截断、title/viewport meta 缺失。任一失败说明**截图本身不可信**：
   - 退出码 1；
   - 写 `GATE_FAILED` 标记文件；
   - 全部截图移入 `quarantine/`，防止误判读。
   **任何视觉判读（008–012）开始前必须确认输出目录里不存在 `GATE_FAILED`。**
2. **advisory（归属用例的脚本层，不作废截图）**：
   - `text_contrast_aa` → 只决定 **DOCQC-009** 的脚本层结论；
   - `images_have_alt` → 只决定 **DOCQC-012** 的脚本层结论（`alt=""` 是合法的
     装饰图声明，只有**缺失 alt 属性**才算失败）;
   - `no_console_errors` → DOCQC-012 参考项（权威检查在 e2e 轨 DOCQC-003）。
   advisory 失败退出码 3，**只影响归属用例的结论，不连坐其他视觉用例**：
   008/010/011 照常在有效截图上判读。

退出码约定：`0` 全绿；`1` 硬门禁失败（截图已隔离，禁止判读）；
`3` 仅 advisory 失败（截图有效，仅 009/012 脚本层红）。

## 对比度探针（text_contrast_aa）的实现语义

- **背景色是实测的**：对每个采样文字元素，从已截的全页 PNG 上取其 bbox
  周边/背后像素的中位色（先剔除接近文字前景色的像素）。天然支持渐变、
  图片背景、半透明表面叠加与任意 CSS 色彩空间——不再有"半透明按近黑近似"
  的系统性误差。
- **前景色在浏览器内归一化**：把 computed color 画到 1x1 canvas 再读回像素，
  `oklch()` / `color(display-p3 …)` / `lab()` 等都会被真实求值而不是被跳过。
- **防空转**：至少评估 1 个样本才允许 pass；无法评估的样本进
  `detail.skipped` 清单并在 stdout 打 WARNING（例如移出画面的跳转链接）。
- **无采样硬顶、背景签名去重**：去重键=前景色 x 字号 x 字重 x 700px 纵向带
  x 300px 横向带 x 有效背景签名（最近的非透明 backgroundColor/backgroundImage
  祖先）。全局硬顶会被长文档前部耗尽导致尾部漏采；背景签名保证同带同前景色
  但背景语境不同的元素（白底白字 vs 深底白字）不会互相遮蔽。SAMPLE_CEILING=800
  只是防恶意构造的安全阀，触顶不静默——`detail.truncated` 置真并 fail-safe 判红。
- **采样窗口向内收缩、双候选背景取低对比**：窗口收缩 2px 取元素内部像素
  （外扩 pad 会把邻居像素混进来）；同时计算「剔除近前景像素的中位色」与
  「全体像素中位色」两个候选背景，取对比度更低者判定——fg≈bg（白底白字）
  病例下前景剔除会把背景一起剔掉，只有全体中位色能暴露问题。
- 阈值仍是 WCAG AA：正文 4.5:1，大字（>=24px 或 >=18.66px 粗体）3.0:1。
  浅色主题/浅色局部区域 + 深色文字属于合法设计，像素实测下自然通过。

## segment 清单的唯一权威

**segment 集合以 probes.json 的 `profiles.<name>.screenshots.segments`
清单为唯一权威**——判读时严格按该清单逐张取图，不要 glob segments 目录
（目录里理论上不该有多余文件，但清单才是契约）。segment 数量有 40 的
sanity 上限；页面高到触顶时脚本记 `segments_complete.truncated=true` 并
**按硬门禁失败处理**（"全部 segment 逐张判读"的前提已被破坏），不会静默截断。

## 图片数量契约（min_images）

`all_images_load` 的最小图片数取自共享 fixture
`tests/fixtures/docqc_requirement_domains.json` → `expectations.min_images`
（缺省 1）。TL 若把 mock 全部换成内联 SVG/canvas，属产品侧合法决策：在同一
变更里把 `min_images` 设为 0，空 `<img>` 集即按空集语义通过，不再需要改脚本。

## 其他要点

- 脚本注入 CSS 冻结所有动画后再截图（文档里的线框字母动画会周期性到 opacity 0，
  不冻结会随机截到"空线框"造成视觉误报），并显式等待 `document.fonts.ready`
  与全部 `<img>` `decode()` 完成（高页全页截图在图片解码中途截取曾产生过
  一次性字节差异）。冻结 + 等待后连续三次运行的全部产物字节级一致（已验证），
  截图确定性可复现。
- 两档宽度固定为 desktop 1440x900 / mobile 390x844，device_scale_factor=2。
- 溢出/破图/失败请求探针与脚本轨 DOCQC-003/007（tests/e2e/）刻意重叠，互为门禁。
- playwright 不可用时的降级方案见脚本 docstring（Chrome --headless=new --screenshot）。

## 视觉理解执行方式

每个 case 文件内含完整 agentic prompt。执行前先确认 `GATE_FAILED` 不存在，
然后把 probes.json 清单里指定的截图 + prompt 交给视觉子代理，
要求输出严格 JSON `{pass, reason, evidence[], risks[]}`，结果存
`tests/reports/docs-qc/DOCQC-0XX.json`。prompt 只问具体视觉问题并要求抄录读到的
文字作为证据，禁止泛泛描述图片。

## 用例索引（视觉轨：DOCQC-008..012）

| 用例 | 类型 | 优先级 | 一句话 |
| --- | --- | --- | --- |
| [DOCQC-008](cases/DOCQC-008-desktop-first-screen.md) | visual | P0 | 桌面首屏 30 秒讲清楚产品与导航 |
| [DOCQC-009](cases/DOCQC-009-dark-text-readability.md) | hybrid | P0 | 深色背景全部文字可读（像素实测对比度 + 视觉复核） |
| [DOCQC-010](cases/DOCQC-010-desktop-full-layout.md) | visual | P1 | 桌面全页无溢出/叠压/空洞，十个关键主题成块可见 |
| [DOCQC-011](cases/DOCQC-011-mobile-layout.md) | visual | P0 | 390px 单列堆叠、表格可读、图片不变形 |
| [DOCQC-012](cases/DOCQC-012-image-caption-integrity.md) | hybrid | P1 | 图片不破图不失真，caption 与图内容互相支撑 |

## 已知基线偏差（提报 TL 卡的视觉发现，2026-07-03 seed draft）

1. **[P1] 鼠标反馈表 390px 逐字竖排**: 4 列表格在移动宽度被压到每列 1-4 字宽，
   第一列"输入/移动/点击/拖拽"逐字竖排。建议移动端给表格加 `overflow-x: auto`
   包裹容器或改为堆叠卡片。对应 DOCQC-011 当前判 fail。
2. **[P2] 问号任务区左卡片(入口和退出)桌面端底部留白偏大**（与右侧四类任务卡
   等高拉伸所致），不影响阅读，记 DOCQC-010 risks。
3. **[P2] 状态 mock PNG 图内文字在移动宽度不可读**（如输入衰减图内的规则 pill），
   属装饰性降级可接受，但 TL 版若继续用 PNG 建议 caption 承载全部关键信息。
