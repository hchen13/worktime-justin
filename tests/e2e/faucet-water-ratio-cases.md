# FAUCET-RATIO 用例集：running 态水柱/出水口像素比像素门（WTJ-20260705-020，P0）

被测：`app/web/` 真实运行版 faucet 任务（frame-anim.js + anim-manifest.js +
task-templates.js 全栈接线），Ethan 反馈"运行版水柱是细小水线，与出水口视觉比例不匹配"。

> **WTJ-20260706-009 更新**：任务 id 由 `click-faucet-on` 改名为 `click-faucet-off`，
> 语义翻转——初始画面表现为"水在流"（原来的 `running` 态现在是 **idle**，任务一渲染就能测，
> 不再需要先点一下才能进入 running），点击后表现为"关水"（active 态从 `running` 改成
> `closing`，一次性关水过程，播完 clamp 在关水静息帧）。下方「三方比对结论」一节记录的是
> 020 卡当时的原始测量（那时任务还叫 click-faucet-on，是点击后进入 running），比例数字本身
> 不受本次改名影响（同一份 running-sheet 资产，只是现在被复用为 idle 态而不是 active 态）；
> 像素门脚本已改造为对新语义驱动（见下方「像素门」表格），并新增了 FAUCET-CLOSE 门验证
> "点击后水柱真的消失"。

## 为什么不能只信 WTJ-20260704-023 的旧 QA pass

`tests/visual/cases/DOCQC-023-asset-quality-canvas-cleanliness.md` 已有一条
"faucet(Ethan 关注点·水柱与出水口匹配)...已解决"的记录，但那条只看了 contact sheet /
预览 GIF / 一次性运行态截图，不是可复跑的像素门，也早于本次新反馈。TL 本卡的调度要求
明确：不得引用旧 023 pass 放行，必须用 Ethan 当前反馈 + 真实运行版重新量化验证。

## 三方比对结论（本卡量化数据，2026-07-05）

| 层级 | 来源 | 水柱宽度 | 出水口宽度 | 比例 |
|---|---|---|---|---|
| docs 源帧 | `docs/assets/production-animations-v1/faucet/running/faucet_running_000.png`（1024 画布） | 137px | 204px | 0.671 |
| 运行时降采 sheet | `app/web/assets/anim/faucet/running-sheet.png`（256px cell，sips 等比降采） | 35px | 52px | 0.673 |
| **真实运行版渲染**（本文件驱动，真实点击 → 真实 canvas 像素） | `faucet_water_ratio_webkit.py` 实测 | 34.0px | 51.3px | **0.662** |

三层比例高度一致（0.66-0.67），**未发现资产选择/降采/帧 sheet 映射/canvas 绘制链路的比例失真**——
docs 源帧本身就是"出水口尺度的下落水柱"（WTJ-20260705-005 返工版，README 自检段明确"水柱宽度约
130-140px"），sips 等比降采（`build-anim-assets.sh` 用同一缩放系数处理宽高，不改变宽高比）与
frame-anim.js 的 drawImage（cell 是正方形、canvas 也是正方形，CSS `.wtj-tt-prop` 的
`height:auto` 依 canvas 固有正方形比例渲染，不发生非等比拉伸）均未引入失真。本卡未发现需要
回退 DESIGN 返工的资产质量问题（验收 7：以此为准，不是引用旧 pass）。

**已排查但排除的干扰因素**：点击后 `[data-anim-state="active"]` 会渐显一圈金色
`drop-shadow` 光晕（`task-templates.css`，与本卡无关的既有点击反馈），实测这圈光晕不改变
canvas 的 CSS 布局尺寸/transform（`getComputedStyle` 全程 `160x160`、`matrix(1,0,0,1,-80,-80)`
不变，仅 filter 的光晕不透明度渐显），本卡确认这不是失真，只是视觉对比度造成的错觉候选项，
已记录供 PM/Ethan 参考、非本卡阻塞。

## 像素门（本文件，可复跑）

`python3 tests/e2e/faucet_water_ratio_webkit.py [--engine webkit|chromium] [--port N]`
退出码：0 全过 / 1 有用例失败（水柱比例或绝对宽度不达标）/ 2 基础设施错误（缺 index.html / 无 playwright）。

| ID | 测什么 | 怎么算过 |
|---|---|---|
| FAUCET-RATIO-no-console-errors | 全程 0 console/page error | 无输出 |
| FAUCET-RATIO-reached-click-faucet-off-task | 真实问号轮转能到达 click-faucet-off | ≤30 次问号点击内命中该 taskId |
| FAUCET-RATIO-measured-canvas-pixels | 任务渲染后（idle 即 running，不需要点击）能从 canvas 读到非零出水口宽度 | `getImageData` 在 anchor 行带测得 outletWidth>0 |
| FAUCET-RATIO-water-to-outlet-ratio-gate | **核心像素门**：idle 态水柱宽度 ÷ 出水口宽度 ≥ 0.45 | 见下方阈值推导 |
| FAUCET-RATIO-water-absolute-width-gate | idle 态水柱绝对宽度 ≥ 15px（256px cell 空间） | 防御"分子分母同时缩小、比例门被绕过"的退化场景 |
| FAUCET-CLOSE-water-disappears-after-click（WTJ-20260706-009 新增） | 真实点击后（等 closing 动画播完 750ms、抢在 900ms DOM 移除前测量）水柱宽度 < 15px | 复用 `MIN_WATER_WIDTH_PX` 同一把尺子做上界检查；实测点击前 35.0px → 点击后 0.0px |

### 阈值推导

健康值实测 ~0.66-0.67（docs 源帧、运行时 sheet、真实 canvas 三层一致）。0.45 门槛留了充分
余量（约健康值的 2/3），既能吸收跨引擎/抗锯齿的量测噪音，又能对"细小水线"级别的真实回归
（预期比例应远低于 0.3-0.35）判定失败——**已用故意调高阈值（0.95）做过自检**：同一次真实测量
在 0.95 门槛下会正确 FAIL（ratio=0.662 < 0.95），证明本门禁不是永远通过的假断言。

### 采样几何说明

faucet 的金属主体（`body_stability`）在 off/running/closing/closed 四态间完全不变，只有水流层
不同。用 `window.WTJ_ANIM_MANIFEST.faucet.running.anchor[1]`（当前 0.78）算出 anchor 行在
256px cell 空间的像素位置，出水口环带采样 `anchor行 - 15`（避开环自身上下两端的弧形收窄，取
其中段的平整环宽），水柱带采样 `anchor行 + 15`（避开环到水柱的过渡段，取水柱稳定段的平整
宽度）；两个带都各自在 ±4 行内取平均以压掉抗锯齿噪音。若未来 DESIGN 重新生成 faucet 资产、
outlet 几何显著改变，这两个 offset 需要重新导出（与 docs 源 manifest 里手工记录
`outlet_anchor_px` / `water_width_sequence_px` 是同一类"绑定当前资产世代几何"的工程取舍）。

## 结论

本卡（WTJ-20260705-020）判定：**运行时资产选择/缩放/帧 sheet 映射链路健康，未发现需要修复的
根因代码 bug，也未发现需要打回 DESIGN 的资产质量问题**。已落地可复跑像素门防止未来回归。
Ethan 反馈的主观观感差异建议由 QA-076/Ethan 在真机复看确认（本卡范围内的三层客观量测一致
支持"水柱与出水口比例匹配"这一结论）。
