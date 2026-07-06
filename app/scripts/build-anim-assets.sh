#!/usr/bin/env bash
#
# build-anim-assets.sh — WTJ-20260704-056 降采样构建管线
#
# 用途：把 docs/assets/production-animations-v1/ 下 v1 已验收的 4 个道具
# （faucet / horse / lamp / treasure-chest）的逐状态 1024px cell strip sheet，
# 用 sips 降采到 256px cell 高度，输出到 app/web/assets/anim/<prop>/<state>-sheet.png，
# 并生成 app/web/anim-manifest.js（window.WTJ_ANIM_MANIFEST，逐 prop 逐 state 的
# {sheetPath, frameCount, fps, loop, anchor, cellSize}）。
#
# prop 列表是**数据驱动**的（Fable 对抗评审 P2-1 修正，不再硬编码道具名）：本脚本从两处
# 自动发现道具——① 顶层 manifest.json 的 assets.<prop>；② src_root 下自带 manifest.json 且
# 带 animations 域的独立子目录（treasure-chest 就是这种模式）。唯一的暂缓门禁是顶层 manifest
# 的 v1_boundary.deferred_to_v2：凡首个 token 命中该列表的 prop（当前 door/bell，质量未验收）
# 一律跳过，不生成降采资产、不写入 anim-manifest.js。**因此 DESIGN 完成 door/bell 的 v2 返工后，
# 只需把它们从 deferred_to_v2 里移除（素材本身早已在各自目录的 manifest.json 里），重跑本脚本
# 即可自动纳入，无需再改本脚本任何逻辑**——这与 anim-manifest.js 头注 / FRAME-ANIM-API.md §7
# 的"重跑即纳入"承诺真正一致。引擎（frame-anim.js）与消费方（task-templates.js）对未出现在
# anim-manifest 里的 prop 一律走"未接入"的防御式回退路径，不需要本脚本额外做特殊标记。
#
# 为什么降采到 256px 而不是原样 1024px：任务道具在 task-templates.css 里的实际
# CSS 显示尺寸上限是 clamp(88px, 12vw, 160px)（见 app/PERFORMANCE.md 3.2 节
# "过度解码"量化：源图/显示尺寸比 1024/160 ≈ 6.4×，解码内存浪费约 41 倍）；
# 宝箱本体展示尺寸上限是 clamp(150px, 20vw, 300px)。256px 高的 cell 覆盖了两者
# 的显示尺寸上限（300px 以内的 Retina 2x 场景也只需要 ~300px 物理像素，256px
# 已经是同一数量级，不是"过度降采"），相比原样 1024px 解码内存直接降到 (256/1024)^2
# = 1/16。四道具全部 state 原样解码总量约 3xxMB 量级（1024×1024×4 字节/帧 ×
# 全部帧数），4GB 目标机（app/PERFORMANCE.md 第 3.6 节"约 2GB 应用可用预算"）
# 下必然导致内存压力甚至 OOM；降采后总量降到约 1/16，回到"个位数 MB 量级"，
# 落在预算内。
#
# 依赖：sips（macOS 系统自带，仅用于图像缩放）、python3（仅用于读取/生成 JSON
# 与 manifest.js 文本，不用于图像处理本身——图像缩放这一步全部由 sips 完成，
# 满足"脚本用 sips 把 strip sheet 降采到 256px"这条硬要求）。
#
# 用法：cd app && ./scripts/build-anim-assets.sh
# 幂等：可重复执行，每次全量重新生成（不依赖增量缓存），失败时非 0 退出。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/.." && pwd)"

SRC_ROOT="$REPO_ROOT/docs/assets/production-animations-v1"
OUT_ASSETS_DIR="$APP_DIR/web/assets/anim"
OUT_MANIFEST="$APP_DIR/web/anim-manifest.js"
TARGET_CELL_HEIGHT=256

if [ ! -d "$SRC_ROOT" ]; then
  echo "错误：找不到源动效目录 $SRC_ROOT" >&2
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "错误：本脚本依赖 sips（macOS 系统自带），当前环境未找到。" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "错误：本脚本依赖 python3（仅用于读取源 manifest.json / 生成 anim-manifest.js 文本，图像缩放仍由 sips 完成）。" >&2
  exit 1
fi

# 源完整性前置校验（WTJ-20260704-079 PM review 打回项）：顶层 manifest.json 是整条降采管线的
# 输入根。必须在**任何**破坏性操作（清空 OUT_ASSETS_DIR）之前确认它存在——否则源缺失时脚本会
# 先 rm -rf 掉已验收的 runtime sheet、再在读 manifest 时失败，把干净 runtime 动效清空成空目录
# （073 把 rm -rf 放在读源之前正是这个隐患）。缺源即 early-fail，绝不触碰输出。
if [ ! -f "$SRC_ROOT/manifest.json" ]; then
  echo "错误：源顶层 manifest.json 不存在: $SRC_ROOT/manifest.json（源不完整，拒绝继续，runtime 输出保持不动）" >&2
  exit 1
fi

# 注意：OUT_ASSETS_DIR 的清空（rm -rf 重建）**刻意推迟**到下方 PLAN_TSV 成功构建且非空之后
# —— 即"确认源完整、计划可产出"之后才清空旧产物。清空本身仍必要（避免源 state 改名/删除后旧
# sheet 残留，如 treasure reward_pop→reward-pop 的孤儿，073 打回项），但绝不能早于源确认，
# 否则任何源不全的重建都会清空已验收 runtime。见下方 PLAN_TSV 校验后的清空块。

echo "==> 读取源 manifest（faucet/horse/lamp 取顶层 manifest.json 的 v1_boundary.included 子集；treasure-chest 取其自身 manifest.json，顶层 manifest 未收录它）"

# 用 python3 解析全部需要处理的 (prop, state, frame_sheet, frameCount, fps, loop, anchor)
# 组合，逐行输出一个 TSV（prop\tstate\tframeSheetRelPath\tframeCount\tfps\tloop\tanchorX\tanchorY），
# bash 侧读取该 TSV 后逐行调用 sips。JSON 解析/文本生成用 python3，图像降采用 sips——
# 两者职责不重叠，满足脚本"用 sips 做降采"这条硬要求。
PLAN_TSV="$(mktemp)"
trap 'rm -f "$PLAN_TSV"' EXIT

python3 - "$SRC_ROOT" "$PLAN_TSV" <<'PYEOF'
import json
import sys

import os

src_root, plan_path = sys.argv[1], sys.argv[2]

top = json.load(open(src_root + '/manifest.json', 'r', encoding='utf-8'))
boundary = top.get('v1_boundary', {})
included_note = boundary.get('included', [])
deferred_note = boundary.get('deferred_to_v2', [])

# Fable 对抗评审 P2-1：prop 列表**数据驱动**，不再硬编码 (faucet horse lamp)。唯一的暂缓门禁
# 是顶层 manifest 的 v1_boundary.deferred_to_v2（每条形如 "door opening"/"bell ring"，取首个
# token 作为被暂缓的 prop 名）。这样 DESIGN 完成 door/bell 的 v2 返工后，只需把它们从
# deferred_to_v2 里移除（素材本身早已在各自目录的 manifest.json 里），重跑本脚本即可自动
# 纳入——无需再改这段脚本逻辑，与 anim-manifest.js 头注 / FRAME-ANIM-API.md §7 的"重跑即
# 纳入"承诺真正一致。
deferred_props = set()
for entry in deferred_note:
    s = str(entry).strip()
    if s:
        deferred_props.add(s.split()[0])

print('    v1_boundary.included:', included_note)
print('    v1_boundary.deferred_to_v2（被暂缓，本脚本跳过）:', deferred_note)
print('    据此解析出的暂缓 prop 名单（跳过）:', sorted(deferred_props))

rows = []
processed_props = []
skipped_deferred = []


def add_prop(prop, animations):
    for state, cfg in animations.items():
        anchor = cfg.get('anchor', [0.5, 0.5])
        rows.append((
            prop, state, cfg['frame_sheet'], len(cfg['frames']),
            cfg['fps'], cfg['loop'], anchor[0], anchor[1]
        ))
    processed_props.append(prop)


# 来源 1：顶层 manifest.json 的 assets.<prop>.animations（当前 faucet/horse/lamp；未来 DESIGN
# 若把新道具补进顶层 assets，这里会自动纳入，无需改脚本）。
for prop in sorted(top.get('assets', {}).keys()):
    if prop in deferred_props:
        skipped_deferred.append(prop)
        continue
    add_prop(prop, top['assets'][prop]['animations'])

# 来源 2：独立成卡、自带 manifest.json 的 prop 子目录（treasure-chest 就是这种模式；door/bell
# v2 落地后若沿用同样的独立 manifest 模式，也会被这里自动发现）。扫描 src_root 下所有子目录，
# 取含 manifest.json 且带 animations 域、且未被 deferred / 未被来源 1 处理过的 prop。非道具目录
# （contact-sheets/previews/source 等）没有 manifest.json，天然被跳过。
for name in sorted(os.listdir(src_root)):
    sub = os.path.join(src_root, name)
    if not os.path.isdir(sub):
        continue
    if name in processed_props:
        continue
    if name in deferred_props:
        if name not in skipped_deferred:
            skipped_deferred.append(name)
        continue
    manifest_path = os.path.join(sub, 'manifest.json')
    if not os.path.isfile(manifest_path):
        continue
    sub_manifest = json.load(open(manifest_path, 'r', encoding='utf-8'))
    animations = sub_manifest.get('animations')
    if not isinstance(animations, dict) or not animations:
        continue
    add_prop(name, animations)

with open(plan_path, 'w', encoding='utf-8') as f:
    for r in rows:
        f.write('\t'.join(str(x) for x in r) + '\n')

print('    据此纳入的 prop（数据驱动，非硬编码）:', processed_props)
print('    据此跳过的暂缓 prop:', skipped_deferred)
print('    计划处理 %d 个 (prop, state) 组合' % len(rows))
PYEOF

# 源确认完整、计划构建成功之后，才做破坏性清空（WTJ-20260704-079）：PLAN_TSV 必须非空——
# python 读源 manifest 若失败，set -e 已在此前退出（输出未动）；若成功但计划为空（源里没有任何
# 可处理的 prop/state），同样拒绝清空，避免把已验收 runtime 清成空目录。只有确认"有东西可重建"
# 才 rm -rf 旧产物 + 重建，从而既保留 073 的"清孤儿"能力、又杜绝"源不全时清空 runtime"隐患。
if [ ! -s "$PLAN_TSV" ]; then
  echo "错误：降采计划为空（源 manifest 未解析出任何 prop/state），拒绝清空 runtime 输出并退出。" >&2
  exit 1
fi
echo "==> 计划非空，清空并重建 ${OUT_ASSETS_DIR} （此步刻意晚于源确认，避免源不全时清空已验收 runtime）"
rm -rf "$OUT_ASSETS_DIR"
mkdir -p "$OUT_ASSETS_DIR"

echo
echo "==> sips 逐个降采到 ${TARGET_CELL_HEIGHT}px cell 高"

TOTAL_ORIG_BYTES=0
TOTAL_OUT_BYTES=0
COUNT=0
SUMMARY_TSV="$(mktemp)"
trap 'rm -f "$PLAN_TSV" "$SUMMARY_TSV"' EXIT

while IFS=$'\t' read -r PROP STATE FRAME_SHEET_REL FRAME_COUNT FPS LOOP ANCHOR_X ANCHOR_Y; do
  SRC_PNG="$REPO_ROOT/$FRAME_SHEET_REL"
  if [ ! -f "$SRC_PNG" ]; then
    echo "错误：源文件不存在: $SRC_PNG" >&2
    exit 1
  fi

  SRC_W=$(sips -g pixelWidth "$SRC_PNG" | awk '/pixelWidth/{print $2}')
  SRC_H=$(sips -g pixelHeight "$SRC_PNG" | awk '/pixelHeight/{print $2}')

  # 目标高度固定 256；宽度按同一比例缩放（cell 是正方形，strip sheet 整体宽高比
  # = frameCount:1，等比缩放不会拉伸单个 cell）。用 python3 算术避免 bash 整数除法
  # 截断误差累积（虽然本例源图均为 1024 的整数倍，仍按比例算更稳妥、可推广）。
  OUT_W=$(python3 -c "print(round($SRC_W * $TARGET_CELL_HEIGHT / $SRC_H))")

  # 权威 frameCount = strip sheet 的实际 cell 数 = 源图宽 / 源图高（cell 为正方形，源 sheet
  # 高恰为 1 个 cell 高，宽为 N 个 cell）。引擎（frame-anim.js）是从这张 strip sheet 逐 cell
  # blit 的，因此"这张 sheet 里到底有多少 cell"才是播放时唯一权威的帧数——不是源 manifest 的
  # frames[] 数组长度。两者本应一致，但源素材偶发漂移（DESIGN 重新导出 sheet/加帧后忘了同步
  # 更新 manifest 的 frames[] 数组，如 2026-07-04 观察到 faucet closing 的 sheet 已是 6 cell、
  # frames[] 仍列 5 项）。以 sheet 为准可彻底消除"frames[] 与 sheet 宽度漂移导致末帧被截断/
  # 越界"这一类问题，并在两者不一致时打印醒目 WARNING 供上报 DESIGN 修正 manifest 元数据。
  SHEET_CELL_COUNT=$(python3 -c "
w, h = $SRC_W, $SRC_H
if h <= 0 or w % h != 0:
    raise SystemExit('源 strip sheet 尺寸异常，宽 %d 不是高 %d 的整数倍（cell 应为正方形）' % (w, h))
print(w // h)
")

  if [ "$SHEET_CELL_COUNT" != "$FRAME_COUNT" ]; then
    echo "    [WARNING] ${PROP}/${STATE}: 源 strip sheet 有 ${SHEET_CELL_COUNT} 个 cell，但源 manifest 的 frames[] 只列了 ${FRAME_COUNT} 帧——以 sheet 的 ${SHEET_CELL_COUNT} 为准（引擎逐 cell blit）。请上报 DESIGN 同步修正源 manifest 的 frames[] 数组。" >&2
  fi

  OUT_DIR="$OUT_ASSETS_DIR/$PROP"
  mkdir -p "$OUT_DIR"
  OUT_PNG="$OUT_DIR/${STATE}-sheet.png"

  sips -z "$TARGET_CELL_HEIGHT" "$OUT_W" "$SRC_PNG" --out "$OUT_PNG" >/dev/null

  ORIG_BYTES=$(stat -f%z "$SRC_PNG")
  OUT_BYTES=$(stat -f%z "$OUT_PNG")
  TOTAL_ORIG_BYTES=$((TOTAL_ORIG_BYTES + ORIG_BYTES))
  TOTAL_OUT_BYTES=$((TOTAL_OUT_BYTES + OUT_BYTES))
  COUNT=$((COUNT + 1))

  # sheetPath：相对 app/web/ 的运行时路径（与 resolveSpritePath() 系列同款 'assets/...' 约定）。
  # frameCount 写入 SHEET_CELL_COUNT（sheet 权威值），不是 manifest 的 frames[] 长度，见上。
  SHEET_RUNTIME_PATH="assets/anim/$PROP/${STATE}-sheet.png"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$PROP" "$STATE" "$SHEET_RUNTIME_PATH" "$SHEET_CELL_COUNT" "$FPS" "$LOOP" "$ANCHOR_X" "$ANCHOR_Y" \
    >> "$SUMMARY_TSV"

  printf '    %-16s %-14s %5dx%-5d -> %5dx%-5d  frames=%s  (%6d B -> %6d B)\n' \
    "$PROP" "$STATE" "$SRC_W" "$SRC_H" "$OUT_W" "$TARGET_CELL_HEIGHT" "$SHEET_CELL_COUNT" "$ORIG_BYTES" "$OUT_BYTES"
done < "$PLAN_TSV"

# ---------------------------------------------------------------------------
# WTJ-20260705-020 faucet 运行时覆盖（水柱粗细，手工交付件优先于 sips 降采）
# ---------------------------------------------------------------------------
# faucet 的运行时 sheet 是 DESIGN 在 docs/.../faucet/wtj-020-thicker-water/runtime-256/ 手工
# 交付、并经 PM/Ethan 目视 + 像素门（tests/e2e/faucet_water_ratio_webkit.py，验收态 water/outlet
# ratio ≈ 0.703）验收的。sips 从当前 1024 源直接 downsample 出的 faucet 会比这份验收态细约 2px
# （gate 0.703→0.662，恰好落回 020 之前 Ethan 打回的"细水线"），因为该验收态用的是更保水宽的
# 降采方式、本脚本的 sips 复现不了。因此降采完后：若这份 020 运行时覆盖件在（尺寸与 sips 输出
# 逐张相同——off/closed 256²、running/closing 1536×256，故 anim-manifest 的 frameCount/cellSize
# 不受影响，只换像素），就用它覆盖 faucet 四张 sheet，保证**重跑本脚本不会静默回退 020 的水柱
# 粗细**。这与 treasure-chest 从自带 manifest 取源同理：faucet 的权威运行时是手工验收件，不该被
# 有损的 sips 再推导覆盖。door/bell 等其它 prop 无此覆盖，正常走 sips 降采。
FAUCET_020_DIR="$SRC_ROOT/faucet/wtj-020-thicker-water/runtime-256"
if [ -d "$FAUCET_020_DIR" ]; then
  echo "==> 应用 WTJ-020 faucet 运行时覆盖（$FAUCET_020_DIR → assets/anim/faucet，防 sips 降采回退水柱粗细）"
  for st in off running closing closed; do
    if [ -f "$FAUCET_020_DIR/$st-sheet.png" ]; then
      cp "$FAUCET_020_DIR/$st-sheet.png" "$OUT_ASSETS_DIR/faucet/${st}-sheet.png"
    fi
  done
fi

echo
echo "==> 生成 $OUT_MANIFEST"

python3 - "$SUMMARY_TSV" "$OUT_MANIFEST" "$TARGET_CELL_HEIGHT" <<'PYEOF'
import json
import sys

summary_path, out_path, cell_size = sys.argv[1], sys.argv[2], int(sys.argv[3])

data = {}
with open(summary_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        prop, state, sheet_path, frame_count, fps, loop, ax, ay = line.split('\t')
        data.setdefault(prop, {})[state] = {
            'sheetPath': sheet_path,
            'frameCount': int(frame_count),
            'fps': float(fps) if '.' in fps else int(fps),
            'loop': (loop == 'True'),
            'anchor': [float(ax), float(ay)],
            'cellSize': cell_size
        }

# 输出稳定排序（prop 与 state 都排序），避免每次重跑产生无意义的 diff 噪音。
ordered = {}
for prop in sorted(data.keys()):
    ordered[prop] = {}
    for state in sorted(data[prop].keys()):
        ordered[prop][state] = data[prop][state]

banner = """// 本文件由 app/scripts/build-anim-assets.sh 自动生成，请勿手工编辑——
// 重新生成：cd app && ./scripts/build-anim-assets.sh
//
// WTJ-20260704-056 — 降采后的道具帧动效 manifest（window.WTJ_ANIM_MANIFEST）。
// 数据来源：docs/assets/production-animations-v1/manifest.json（faucet/horse/lamp）
// 与 docs/assets/production-animations-v1/treasure-chest/manifest.json（顶层 manifest
// 未收录 treasure-chest，见该卡自身 manifest.json 的 scope_note）。
//
// prop 列表由构建脚本数据驱动：从顶层 manifest 的 assets 键 + 各独立子目录 manifest.json
// 自动发现，唯一门禁是顶层 manifest 的 v1_boundary.deferred_to_v2（命中的 prop 跳过、不写入
// 本文件）。当前 deferred_to_v2 为空 —— WTJ-20260705-025 把 door/bell 的 v1 动画（各自
// 已 DESIGN 验收，卡 WTJ-20260704-030 门 / -031 铃）从 deferred_to_v2 移入 included 并接入
// 运行时引擎，故本文件现含 faucet/horse/lamp/treasure-chest/door/bell 全部 6 个 prop。
// frame-anim.js 对未出现在这里的 prop 仍走防御式回退（静态 img 占位）；若未来再暂缓某 prop，
// 把它加回 deferred_to_v2 重跑本脚本即可，**无需改脚本任何逻辑**。
//
// 每个 state 的字段：
//   sheetPath   相对 app/web/ 的运行时路径（256px cell 降采后的 strip sheet）。
//   frameCount  该 state 的帧数 = 该 strip sheet 的实际 cell 数（= 降采后 sheet 宽度 /
//               cellSize，也 = 源 sheet 宽度 / 高度）。**以 sheet 的 cell 数为权威**，不是
//               源 manifest 的 frames[] 数组长度——引擎逐 cell blit，sheet 有几个 cell 就是
//               几帧；两者本应一致，源素材偶发漂移时构建脚本会打印 WARNING 并以 sheet 为准。
//   fps         源 manifest 给出的播放帧率。
//   loop        源 manifest 给出的是否循环（frame-anim.js 的 play() 调用方可用
//               opts.loop 覆盖这个默认值，见 FRAME-ANIM-API.md）。
//   anchor      源 manifest 给出的 [x,y] 锚点（0-1 归一化），本卡暂未消费（预留
//               给未来需要精确对齐锚点的场景），仅透传保留。
//   cellSize    降采后每帧正方形 cell 的边长（像素），当前固定 256。

(function () {
  'use strict';

  function deepFreeze(obj) {
    if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
      return obj;
    }
    if (Object.isFrozen(obj)) {
      return obj;
    }
    Object.getOwnPropertyNames(obj).forEach(function (key) {
      deepFreeze(obj[key]);
    });
    return Object.freeze(obj);
  }

  var DATA = """

js_literal = json.dumps(ordered, indent=2, ensure_ascii=False)

footer = """;

  window.WTJ_ANIM_MANIFEST = deepFreeze(DATA);
})();
"""

with open(out_path, 'w', encoding='utf-8') as f:
    f.write(banner)
    f.write(js_literal)
    f.write(footer)

print('    已生成 %s，包含 %d 个 prop' % (out_path, len(ordered)))
PYEOF

echo
echo "==> 体积对比"
printf '    原始 sheet 总大小:   %10d B (%.1f MB)\n' "$TOTAL_ORIG_BYTES" "$(python3 -c "print($TOTAL_ORIG_BYTES/1024/1024)")"
printf '    降采后 sheet 总大小: %10d B (%.1f MB)\n' "$TOTAL_OUT_BYTES" "$(python3 -c "print($TOTAL_OUT_BYTES/1024/1024)")"
printf '    压缩比: %.1fx\n' "$(python3 -c "print($TOTAL_ORIG_BYTES/$TOTAL_OUT_BYTES)")"
printf '    处理组合数: %d\n' "$COUNT"

echo
echo "全部完成，exit 0。"
