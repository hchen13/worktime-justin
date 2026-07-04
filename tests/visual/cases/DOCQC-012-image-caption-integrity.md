# DOCQC-012 Mock 图片完好性与图文配对（沟通工具价值）

- 类型: hybrid（脚本破图检测 + 视觉配对复核）
- 优先级: P1
- 关联需求: QA 卡验收标准 4（图片路径有效）+ 需求文档作为沟通工具：状态图必须
  真实支撑它下面的文字主张
- 前置: `python3 tests/visual/scripts/capture_docs.py`；视觉层判读前确认
  `tests/reports/docs-qc/GATE_FAILED` **不存在**（存在=硬门禁失败、截图已隔离，
  禁止判读）。
- 脚本层归属（见 tests/visual/README.md 两级门禁语义）:
  - `all_images_load` / `no_failed_requests` 属**硬门禁**（破图/失败请求同时
    意味着截图不可信）；
  - `images_have_alt` 是 **advisory** 探针，**只**决定本用例（DOCQC-012）的
    脚本层结论，失败（退出码 3）不作废截图、不连坐 008/009/010/011。
    判定是 `hasAttribute('alt')` 存在性检查：`alt=""` 是合法的装饰图声明
    （WCAG），**只有缺失 alt 属性才算失败**；
  - `no_console_errors` 为本用例参考项（权威检查在 e2e 轨 DOCQC-003）。
- 输入: `tests/reports/docs-qc/probes.json`（`gate.all_images_load` +
  `advisory.images_have_alt`）+ 桌面 segments 中含图片的部分（segment 集合
  以 probes.json `screenshots.segments` 清单为唯一权威）

## 测什么
1. 所有 <img> 通过 file:// 打开时真实加载（相对路径有效、无 0 尺寸破图）——脚本层。
2. 每张状态 mock 图渲染质量和图文一致性——视觉层：图不糊、不被暗色卡片"吃掉"、
   不变形；图片下的 caption 描述的状态确实是图里画的状态（例如 caption 说
   "秘密词命中出现小狗"，图里就应该看得到小狗/命中时刻）。

## 怎么测
- 脚本层：capture_docs.py 的 `all_images_load`（naturalWidth>0 且请求无失败）与
  `no_failed_requests`；同时 probes.json 里留有每张图的 src/自然尺寸/渲染宽度清单。
- 视觉层：把包含图片卡片的桌面 segment 交给视觉子代理执行下面 prompt。

## 视觉理解 Prompt

```
你在质检需求文档里的产品状态 mock 图。这些截图里有若干"图片 + 下方一行说明文字
(caption)"的卡片。对每一张这样的卡片回答：

1. 图片本体是否正常渲染？（不是破图标志、不是纯色空块、没有明显拉伸/压扁的
   宽高比失真、没有和深色背景融为一体导致边界不可辨）
2. 把 caption 文字抄下来，然后回答：图里画的内容是否支撑这段 caption？
   具体指出图中可见的、与 caption 关键词对应的元素（例如 caption 提到"五个发现槽"
   → 图下方是否可见 5 个槽位；提到"宝箱" → 是否可见宝箱）。
   对应不上的写明"caption 说 X，但图中未见 X"。
3. 这张图在当前渲染尺寸下，是否足以让一个没参与讨论的评审人理解它想表达的状态？
   （图内关键元素太小/太暗看不清也算不理解。）

最后回答汇总问题：
4. 所有图片卡片里，有没有两张图看起来完全相同（可能是贴错素材）？

输出严格 JSON：
{
  "pass": true/false,
  "reason": "一句话",
  "evidence": ["每张图片卡片一条：caption 抄录 + 支撑/不支撑判定 + 依据"],
  "risks": ["能看懂但勉强的图，例如图内文字过小"]
}
判定规则：任何一张图破损/失真/与 caption 明显不符/两图重复 → pass=false。
"图偏暗但关键元素可辨" 进 risks。
```

## 怎么算过
- 脚本层：`gate.all_images_load.pass == true` 且
  `gate.no_failed_requests.pass == true` 且
  `advisory.images_have_alt.pass == true`（每个 `<img>` 都带 alt 属性；
  `alt=""` 合法）。
- 视觉层：pass=true 且每张图片卡片都有 evidence 条目。
- 图片总数应与 probes.json 的 images 清单一致（视觉层漏图 = 执行不合格，重跑）。
- `images_have_alt` 单独失败只红本用例脚本层，不影响其他视觉用例。

## 证据
- probes.json 的 images 清单（src、naturalWidth、renderedWidth）
- 视觉 JSON 存 `tests/reports/docs-qc/DOCQC-012.json`

## 鲁棒性说明
- 脚本层对"所有 <img>"生效，不关心图片数量和路径怎么改；TL 增删状态图自动纳入。
- 视觉层按"图 + 紧邻说明文字"的通用模式识别卡片，不绑定 .caption class。
- 最小图片数是**可配置契约**：`all_images_load` 要求 `<img>` 总数 >=
  `tests/fixtures/docqc_requirement_domains.json` → `expectations.min_images`
  （缺省 1，防"图全没加载出来所以没有破图"的假阳性）。TL 若把 mock 全部换成
  内联 SVG/canvas，属产品侧合法决策：在同一变更里把 `min_images` 设为 0，
  空 `<img>` 集即按空集语义通过（已验证），**不需要改脚本**；此时
  `images_have_alt` 对空集也自然通过，本用例视觉层改为对内联图形做同样的
  图文配对复核。
