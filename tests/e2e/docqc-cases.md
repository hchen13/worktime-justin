# DOCQC 用例集：docs/index.html 需求文档质控（WTJ-20260703-003，合并版）

被测对象：`docs/index.html`（当前为 PM seed draft 演进版；TL 将在 WTJ-20260703-002 交付正式版）。
本文件是 QA 汇总后的统一用例索引（DOCQC-001..012）：001-007 为脚本化轨，
008-012 为视觉/UX 轨（用例详情见 `tests/visual/cases/DOCQC-0XX-*.md`，
视觉轨总说明见 `tests/visual/README.md`）。

所有用例对合理重构鲁棒：内容断言基于渲染文本的概念词组，不耦合 class/DOM 结构；
内容断言按 `data-domain` section 切片匹配（nav/图注/参数表中的残留提及不计入），
并对 `#coverage` 矩阵与正文 `data-req-id` 节点做 REQ 清单对账——文档自带的
『此表同时作为 QA 的断言清单』契约由 DOCQC-004 强制执行。
结构断言只依赖 HTML 通用不变量（锚点必须有目标、页面不能横向滚动等）；
视觉断言只依赖结果性事实（可读、不叠压、不变形、主题成块可见）。

运行方式：

```bash
python3 tests/e2e/docqc_static.py             # DOCQC-001(静态)/002/004/005/006，仅 stdlib
python3 tests/e2e/docqc_browser.py            # DOCQC-001(打开)/003/007，需 playwright
python3 tests/visual/scripts/capture_docs.py  # DOCQC-008..012 截图前置 + 两级探针（gate/advisory）；
                                              # 退出码 0 全绿 / 1 硬门禁失败（截图隔离，禁判读）
                                              # / 3 仅 advisory 红（只红 009/012 脚本层）
# DOCQC-008..012 判读：把截图交视觉子代理执行 tests/visual/cases/ 对应 prompt
```

报告输出到 `tests/reports/`：`docqc_static_report.json`、`docqc_browser_report.json`、
`docs-qc/`（截图、segments、probes.json、视觉判读 JSON）。
`docs-qc/` 下若存在 `GATE_FAILED` 标记文件，说明硬门禁失败、全部截图已移入
`docs-qc/quarantine/`，任何视觉判读（008–012）必须先确认该文件不存在；
segment 集合一律以 probes.json 的 `profiles.<name>.screenshots.segments` 清单为
唯一权威（不要 glob 目录），probes.json 的 `docSha256` 把判读结论绑定到确切文档版本。

| ID | 名称 | 类型 | 优先级 | 资产 |
|---|---|---|---|---|
| DOCQC-001 | 本地可打开性与文档骨架健全 | scripted | P0 | e2e/docqc_static.py + e2e/docqc_browser.py |
| DOCQC-002 | 静态资源引用完整性（存在性/大小写/文件头/可移植性：file:、绝对路径、//协议相对一律 FAIL，data: URI 允许） | scripted | P0 | e2e/docqc_static.py |
| DOCQC-003 | 运行时资源健康与离线自包含（file:// 子资源须在文档目录前缀内；min_images 可配置） | scripted | P0 | e2e/docqc_browser.py |
| DOCQC-004 | 十大需求域覆盖（data-domain 切片）+ REQ 清单对账（#coverage 矩阵 vs data-req-id 节点：逐条定义、野 id、域条数、合计、锚点-域匹配） | scripted | P0 | e2e/docqc_static.py + fixtures/docqc_requirement_domains.json |
| DOCQC-005 | 关键已定决策点保真（按 fact scope 域切片；FAIL 打印未命中 regex group） | scripted | P1 | e2e/docqc_static.py + 同上 fixture |
| DOCQC-006 | 锚点导航完整性（`<nav>` 与 `role="navigation"` 等价） | scripted | P1 | e2e/docqc_static.py |
| DOCQC-007 | 响应式水平溢出检测（320–1440px 六档；overflow-x:hidden/clip 裁剪内容判不可达 FAIL） | scripted | P0 | e2e/docqc_browser.py |
| DOCQC-008 | 桌面首屏视觉清晰度（1440x900） | visual | P0 | visual/cases/DOCQC-008-desktop-first-screen.md |
| DOCQC-009 | 深色背景文字可读性（像素实测对比度 + 视觉复核） | hybrid | P0 | visual/cases/DOCQC-009-dark-text-readability.md + visual/scripts/capture_docs.py |
| DOCQC-010 | 桌面全页排版密度与十主题成块可见 | visual | P1 | visual/cases/DOCQC-010-desktop-full-layout.md |
| DOCQC-011 | 移动宽度排版（390x844 全页） | visual | P0 | visual/cases/DOCQC-011-mobile-layout.md |
| DOCQC-012 | Mock 图片完好性与图文配对 | hybrid | P1 | visual/cases/DOCQC-012-image-caption-integrity.md + visual/scripts/capture_docs.py |

覆盖分工要点：

- DOCQC-004（内容轨，文本级）与 DOCQC-010（视觉轨，成块可见）对十大需求域互为冗余：
  004 抓"文档里没写"，010 抓"写了但排版上看不见/不成块"。
- DOCQC-004 已消除残留喂绿路径：整节删除/隐藏（hidden、内联 display:none）由
  REQ 对账与 section 切片双路径确定性捕获（变异实测：删正文留矩阵行 → REQ 对账红；
  连矩阵行删 → 合计/切片红）。004 与 005 仍成对跑：004 抓结构性缺失，005 抓决策点被改写。
- DOCQC-007（数值溢出）与 DOCQC-011（拥挤但没溢出）互补，共同覆盖 WTJ-002 验收标准 5。
- DOCQC-007 的豁免定义：越界元素仅当最近相关祖先 computed overflow-x 为 auto/scroll
  （真滚动容器）时豁免；越过 overflow-x:hidden/clip 祖先盒边界的内容判为不可达 FAIL
  （报告字段 clipped），即使页面整体 scrollWidth 不溢出；aria-hidden="true" 装饰性子树
  的裁剪不计。完全位于视口左/上侧之外（right<=0 或 bottom<=0，不增加 scrollWidth）的
  元素属无障碍 skip-link 惯例，不产生"疑似内容被切"警告。
- capture_docs.py 的探针分两级：硬门禁（水平溢出/破图与图片数不足/失败请求/pageerror/
  segment 触顶截断/title+viewport meta）失败即截图不可信——写 GATE_FAILED 并整体隔离到
  quarantine/，与 DOCQC-003/007 刻意重叠、互为门禁；advisory（text_contrast_aa→DOCQC-009、
  images_have_alt→DOCQC-012、no_console_errors→012 参考项，权威在 DOCQC-003）失败只红
  归属用例的脚本层，不连坐其他视觉用例。
- DOCQC-012 脚本层 = gate.all_images_load + gate.no_failed_requests（硬门禁部分）+
  advisory.images_have_alt（仅归属本用例）。images_have_alt 是 hasAttribute('alt')
  存在性检查：alt="" 是合法的装饰图声明（WCAG），只有缺失 alt 属性才算失败。

维护约定：

- TL 重构后跑全套即可，脚本与视觉 prompt 不应因 DOM 结构变化而挂。
- 退出码语义：0=全 PASS；1=至少一个用例 FAIL（合法红）；2=基础设施错误，
  此时报告含 error 字段且 cases 为空，harness 不得将 2 当作文档失败处理。
  各脚本的 2 号触发面：docqc_static.py（doc/fixture 缺失、fixture 非 JSON、
  文档非 UTF-8）；docqc_browser.py（doc 缺失、fixture 存在但非 JSON；fixture
  缺失按可选处理走默认值）；capture_docs.py（doc 缺失，另有 3=仅 advisory 红）。
- 若 TL 刻意改了概念用词（如"发现槽"改名），在同一个变更里更新
  `tests/fixtures/docqc_requirement_domains.json` 并在 QA 卡注明。
- DOCQC-005 facts 钉决策不钉措辞：合法同义改写（不算失败→不判定为失败、长按→按住、
  自带→内置等）打红属于 fixture 缺陷，正确处置是放宽对应 regex group（fixture _comment
  有维护契约），而不是要求 TL 改稿；FAIL 输出会打印未命中的具体 regex group 与检索
  scope 便于定位。
- 若产品决策真的变更（如五槽改四槽），DOCQC-005 变红是正确行为：
  随决策更新 fixture 并在 QA 卡留痕。
- 静态轨可见性：hidden 属性与内联 display:none 子树不计入语料与 REQ 定义；
  深层 CSS 类隐藏由视觉/浏览器轨兜底（DOCQC-003/008-012）。
- all_images_load 的最小图片数是可配置契约：`tests/fixtures/docqc_requirement_domains.json`
  → `expectations.min_images`（缺省 1）。TL 把 mock 全部换成内联 SVG/canvas 时，在同一
  变更里把 min_images 设为 0，空 `<img>` 集按空集语义通过（images_have_alt 对空集亦通过），
  docqc_browser.py 与 capture_docs.py 都尊重该键，不需要改脚本。
- 新增文档页面（多页站点）时，对每个页面复跑 docqc_static/docqc_browser，
  脚本支持 `--doc` 参数；capture_docs.py 支持 `--doc`/`--out`。

已知基线状态：

- 2026-07-03（seed draft）：脚本轨 DOCQC-001..007 全部 PASS（含变异测试验证每个检查器
  可真实报红）。视觉轨已知偏差：DOCQC-011 按判定规则应 fail —— 鼠标反馈 4 列表格在
  390px 被压成逐字竖排（P1，已提报 TL，建议 overflow-x 容器或移动端堆叠卡片）；
  另有 2 个 P2 risk 记录于 tests/visual/README.md。TL 正式版期望全部转 PASS。
- 2026-07-04：对抗评审第 1 轮（3 lens）findings FP-01(blocker)/FP-02/FP-03/FP-04/
  FALSERED-01~05/ADV-ENG-001~006 已全部修复并经变异实验回归（删域两变体红、
  file:/绝对/协议相对引用红、overflow 裁剪红、白底白字与 oklch 低对比红、隐藏子树红、
  陈旧 segment 清理、门禁隔离生效；同义改写、role=navigation、alt=""、浅色主题合法
  重构保持绿），全套脚本对当前 docs/index.html 跑绿。文档现内置 QA 断言契约
  （正文 data-req-id 节点 + #coverage 矩阵对账，条数以矩阵合计行为准，不在本索引
  写死——文档是移动目标），DOCQC-004 正式消费该契约。
- 2026-07-04 对抗评审第 2 轮（独立复核，3 lens）：第 1 轮全部 findings 确认修复；
  新抓 2 major 并已修——（a）对比度探针全局 60 条采样硬顶被长文档前部耗尽，尾部
  白底白字整段漏采，且外扩 pad 的邻居像素泄漏 + 前景剔除在 fg≈bg 病例下把背景一起
  剔掉，会把不可读判成高对比：改为无硬顶 + 去重键含背景签名 + 窗口向内收缩 +
  双候选背景取低对比（详见 tests/visual/README.md），触顶 fail-safe 判红；
  （b）coverage 矩阵合法追加尾列（备注）导致合计行 row[-1] 解析失败
  误红：改为从右向左取第一个纯数字单元格，合计行存在但不可解析时不再叠加"缺少
  合计行"。另修 3 minor：docqc_browser infra 路径对齐 exit 2 契约、野 REQ id 级联
  噪音聚合（>6 条汇总）、本索引不再写死 data-req-id 条数。
  回归变异新增钉子：矩阵追加尾列须绿；白底白字局部注入文首+文尾在双 profile
  下都须 advisory 红。
