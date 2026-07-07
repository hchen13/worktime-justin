#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 docs/design-review.html —— WTJ-20260705-021 设计总览页生成器。

背景：Ethan 原话「把 design 以前做过的所有设计全部放到需求文档里面，我全部过一遍；
不要 QA，我一眼能看到」。本脚本扫描历史 DESIGN 产出的固定目录集合（见 SCAN_ROOTS /
下方各 build_* 调用处），按类别分组生成可点开的缩略图画廊，标注原始路径、关联飞书卡号
（从邻近 manifest.json / README.md / prompt-and-rationale.md / validation.md 解析）、
当前用途标签，并在文末生成断链检查清单。

用法：
    python3 docs/scripts/gen-design-review.py
    → 生成/覆盖 docs/design-review.html，并在 stdout 打印扫描统计 + 静态链接检查结果。

设计取舍：
    - 不复制任何素材，只引用现有相对路径；相对路径以 docs/design-review.html 所在目录
      （即 docs/）为基准计算，可保证 file:// 双击打开时图片正常显示。
    - 卡号解析：对每个文件，从其自身内容（若为 .md/.json）开始，再逐级向上（不超过
      其所属 scan root 目录）查找 manifest.json / README.md / prompt-and-rationale.md /
      validation.md，用正则 WTJ-\\d{8}-\\d{3}（大小写不敏感）提取，去重后最多展示 3 个，
      找不到显示“—”。
    - 用途标签规则见 tag_for()：以文件所属 scan root 为主要依据，辅以少量路径关键字
      （stub/placeholder → 疑似旧版）。design-expansion-v2 下的候选包，其 README 普遍
      明确写明“供 PM/Ethan 评审，非自动运行时接入”，故整体标记为“待接入”。
    - 本脚本可重复运行、幂等，不依赖网络或外部依赖，仅用标准库。

返工（WTJ-20260705-021b，Ethan 原话「不用跑 app 就能试听所有发音/任务语音」）：
    - 新增「音频试听专区」（见 render_audio_preview_section 及其三个子函数），置于页面最顶部，
      不复制音频、只引用现有相对路径，用原生 <audio controls preload="none">（非 <script>，
      符合 docs 零 JS 约束）。
    - 秘密词英文发音：直接解析 app/web/manifest.js 里 secretWords.pool 数组（唯一权威的
      word → spriteFile → audioFile 三元组来源，运行时引擎本身也读这份数据），而不是靠文件名
      猜测配对——pool 里有 sprite 文件名与音频文件名对不上的已知例外（如 treasurechest 词对应
      sprite treasure-chest.png），只有解析 manifest.js 才能保证配对正确。新增词只需追加到
      pool，重跑本脚本即自动出现，不需要改这份生成器。
    - 中文/英文任务语音列表：扫描 app/web/audio/tasks/*.zh.m4a 与 *.m4a（不含 .zh），文案从
      app/scripts/tts-text-manifest.zh.json / .json 的 out 字段反查，同样新增文件+manifest 条目
      即自动出现。
    - 音频引用同样走 rel_href() + ALL_REFS，复用既有 check_links() 静态检查，缺失的音频文件会
      和图片断链一样出现在页尾「断链/待补清单」，不需要额外写检查逻辑。
"""
from __future__ import annotations

import html
import json
import os
import re
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
DOCS_DIR = REPO_ROOT / "docs"
OUTPUT = DOCS_DIR / "design-review.html"

CARD_RE = re.compile(r"WTJ-\d{8}-\d{3}", re.IGNORECASE)
IMG_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
TEXT_EXTS = {".md", ".json", ".py", ".html"}
SKIP_NAMES = {".gitkeep", ".DS_Store"}
CONTEXT_FILENAMES = ("manifest.json", "README.md", "prompt-and-rationale.md", "validation.md")

TAG_CLASS = {
    "运行时已接入": "tag-runtime",
    "生产素材": "tag-prod",
    "设计稿": "tag-design",
    "待接入": "tag-pending",
    "疑似旧版": "tag-stale",
}

# 全局收集所有渲染出的本地资产引用 (href, 原始 repo 相对路径)，供末尾断链检查复用。
ALL_REFS: list[tuple[str, str]] = []
# 统计
STATS = {"per_root": [], "tag_counts": {}, "total_items": 0}


def esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def rel_href(repo_relpath: str) -> str:
    target = REPO_ROOT / repo_relpath
    return os.path.relpath(target, start=DOCS_DIR).replace(os.sep, "/")


def list_files(root_relpath: str, exclude_top_subdirs: set[str] | None = None) -> list[str]:
    """递归列出 root_relpath 下所有文件（repo 相对路径，POSIX 分隔符），已排序。
    exclude_top_subdirs：跳过 root 的这些直接子目录（用于把某些子目录单独成组时避免重复）。
    """
    root = REPO_ROOT / root_relpath
    out: list[str] = []
    if not root.exists():
        return out
    exclude_top_subdirs = exclude_top_subdirs or set()
    for dirpath, dirnames, filenames in os.walk(root):
        cur = Path(dirpath)
        if cur == root:
            dirnames[:] = [d for d in sorted(dirnames) if d not in exclude_top_subdirs]
        else:
            dirnames.sort()
        for fn in sorted(filenames):
            if fn in SKIP_NAMES:
                continue
            full = cur / fn
            out.append(full.relative_to(REPO_ROOT).as_posix())
    return sorted(out)


def list_files_top_only(root_relpath: str) -> list[str]:
    """只列出 root_relpath 直接子文件（不递归子目录），用于 docs/assets 顶层散图，
    避免与已单独成组的子目录（style / design-expansion-v2 / production-* / sprites / states）重复。
    """
    root = REPO_ROOT / root_relpath
    out: list[str] = []
    if not root.exists():
        return out
    for entry in sorted(os.listdir(root)):
        full = root / entry
        if full.is_file() and entry not in SKIP_NAMES:
            out.append((Path(root_relpath) / entry).as_posix())
    return sorted(out)


def tag_for(repo_relpath: str) -> str:
    p = repo_relpath.replace("\\", "/")
    low = p.lower()
    # 运行时目录最优先：app/web/assets/**（含 sprites/task-props/rewards/ui/anim）与 app/web/anim/
    # 都是运行版实际引用的素材，即使文件名含 placeholder（如运行时兜底占位 sprite）也算“运行时已接入”。
    if p.startswith("app/web/assets/") or p.startswith("app/web/anim/"):
        return "运行时已接入"
    # docs 下的 stub/placeholder（如 production-pack-b/stubs/ 历史占位）标记为疑似旧版。
    if "/stub" in low or "placeholder" in low:
        return "疑似旧版"
    if p.startswith("docs/assets/production-pack-a/") or p.startswith("docs/assets/production-pack-b/"):
        return "生产素材"
    if p.startswith("docs/assets/production-animations-v1/"):
        return "生产素材"
    # docs/assets/sprites：sprite 生产基准 v3 源图（contact/alpha/source sheet + 单体基准）。
    if p.startswith("docs/assets/sprites/"):
        return "生产素材"
    if p.startswith("docs/assets/design-expansion-v2/"):
        return "待接入"
    if p.startswith("docs/assets/style/") or p.startswith("docs/design/"):
        return "设计稿"
    # docs/assets/states：核心状态图设计稿。
    if p.startswith("docs/assets/states/"):
        return "设计稿"
    if p.startswith(".agents/briefs/design/"):
        return "设计稿"
    # docs/assets 顶层散图（accepted-mvp-mockup / state-*.png 等）：方向示意设计稿。
    rest = p[len("docs/assets/"):] if p.startswith("docs/assets/") else ""
    if rest and "/" not in rest:
        return "设计稿"
    return "待接入"


def _search_text_for_cards(path: Path, seen: set[str], ids: list[str]) -> None:
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return
    for m in CARD_RE.findall(text):
        key = m.upper()
        if key not in seen:
            seen.add(key)
            ids.append(key)


def find_card_ids(file_repo_relpath: str, scan_root_repo_relpath: str) -> str:
    file_path = REPO_ROOT / file_repo_relpath
    scan_root = (REPO_ROOT / scan_root_repo_relpath).resolve()
    seen: set[str] = set()
    ids: list[str] = []

    # 1) 文件自身（若为文本类）
    if file_path.suffix.lower() in {".md", ".json"}:
        _search_text_for_cards(file_path, seen, ids)

    # 2) 沿目录逐级向上找 manifest/README/prompt-and-rationale/validation，直到 scan root
    cur = file_path.parent.resolve()
    visited_dirs = 0
    while True:
        for name in CONTEXT_FILENAMES:
            _search_text_for_cards(cur / name, seen, ids)
        if cur == scan_root or cur.parent == cur:
            break
        cur = cur.parent
        visited_dirs += 1
        if visited_dirs > 30:  # 安全阀，避免异常路径导致死循环
            break
    return " / ".join(ids[:3]) if ids else "—"


SEEN_FOR_STATS: set[str] = set()


def render_item(repo_relpath: str, scan_root_repo_relpath: str) -> str:
    ext = Path(repo_relpath).suffix.lower()
    href = rel_href(repo_relpath)
    ALL_REFS.append((href, repo_relpath))
    tag = tag_for(repo_relpath)
    # 同一文件可能在「对比专区」里被再次渲染一次(有意为之,方便并排比较),
    # 但统计口径要按去重后的唯一文件计,避免总数虚高。
    if repo_relpath not in SEEN_FOR_STATS:
        SEEN_FOR_STATS.add(repo_relpath)
        STATS["tag_counts"][tag] = STATS["tag_counts"].get(tag, 0) + 1
        STATS["total_items"] += 1
    cards = find_card_ids(repo_relpath, scan_root_repo_relpath)
    tag_class = TAG_CLASS.get(tag, "tag-pending")
    name = esc(Path(repo_relpath).name)
    if ext in IMG_EXTS:
        thumb = (
            f'<a href="{esc(href)}" target="_blank" rel="noopener" class="thumb-link">'
            f'<img src="{esc(href)}" loading="lazy" alt="{name}" /></a>'
        )
    else:
        kind = ext.lstrip(".").upper() or "FILE"
        thumb = (
            f'<a href="{esc(href)}" target="_blank" rel="noopener" class="file-chip">'
            f'<span class="file-ext">{esc(kind)}</span><span class="file-name">{name}</span></a>'
        )
    return (
        '<figure class="item">'
        f"{thumb}"
        '<figcaption>'
        f'<span class="tag {tag_class}">{esc(tag)}</span>'
        f'<code class="path">{esc(repo_relpath)}</code>'
        f'<span class="cards">卡号: {esc(cards)}</span>'
        '</figcaption>'
        '</figure>'
    )


def render_group(subtitle: str, files: list[str], scan_root_repo_relpath: str, anchor: str | None = None) -> str:
    if not files:
        return ""
    head = ""
    if subtitle:
        anchor_attr = f' id="{esc(anchor)}"' if anchor else ""
        head = f'<h3{anchor_attr}>{esc(subtitle)} <span class="count">({len(files)})</span></h3>'
    items = "".join(render_item(f, scan_root_repo_relpath) for f in files)
    return f'{head}<div class="grid">{items}</div>'


def group_by_immediate_subdir(root_relpath: str) -> list[tuple[str, list[str]]]:
    """把 root 下的文件按「直接子目录」分组；根目录下的散文件归入“(根目录参考文件)”组。
    返回 [(子目录名或根目录标签, [repo相对路径,...]), ...]，根目录组排最后。
    """
    root = REPO_ROOT / root_relpath
    groups: dict[str, list[str]] = {}
    root_loose: list[str] = []
    if not root.exists():
        return []
    for f in list_files(root_relpath):
        rel_to_root = Path(f).relative_to(root_relpath)
        parts = rel_to_root.parts
        if len(parts) == 1:
            root_loose.append(f)
        else:
            groups.setdefault(parts[0], []).append(f)
    ordered = [(k, sorted(v)) for k, v in sorted(groups.items())]
    if root_loose:
        ordered.append(("(根目录参考文件)", sorted(root_loose)))
    return ordered


def render_source_root(root_relpath: str, title: str, anchor: str, note: str = "") -> str:
    files_count = len(list_files(root_relpath))
    STATS["per_root"].append((title, root_relpath, files_count))
    parts = [f'<h2 id="{esc(anchor)}">{esc(title)} <span class="count">(共 {files_count} 项)</span></h2>']
    if note:
        parts.append(f'<p class="section-note">{note}</p>')
    groups = group_by_immediate_subdir(root_relpath)
    if not groups:
        parts.append('<p class="section-note">（目录不存在或为空）</p>')
    elif len(groups) == 1 and groups[0][0] == "(根目录参考文件)":
        # 纯扁平目录（无子目录，如 app/web/assets/sprites）：直接铺一张网格，不加多余子标题。
        parts.append(render_group("", groups[0][1], root_relpath))
    else:
        for i, (subdir, files) in enumerate(groups):
            sub_anchor = f"{anchor}-{i}"
            parts.append(render_group(f"{title} / {subdir}", files, root_relpath, anchor=sub_anchor))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 音频试听专区（WTJ-20260705-021b 返工）：不用跑 app 就能试听所有发音/任务语音。
# 三组：秘密词英文发音 / 中文任务语音 / 英文任务语音（对照）。全部现场扫描目录 + manifest，
# 新增文件后重跑本脚本即出现，不手写任何条目。
# ---------------------------------------------------------------------------

MANIFEST_JS_RELPATH = "app/web/manifest.js"
POOL_ITEM_RE = re.compile(
    r"\{\s*word:\s*'([^']+)',\s*spriteFile:\s*'([^']+)',\s*audioFile:\s*'([^']+)'\s*\}"
)


def parse_secret_word_pool() -> list[dict[str, str]]:
    """解析 app/web/manifest.js 的 secretWords.pool 数组，取得权威的
    word → spriteFile → audioFile 三元组（唯一真源；运行时引擎本身也读这份数据，
    比按文件名猜测配对更可靠——pool 里存在 sprite/audio 文件名对不上的已知例外，
    如 treasurechest 词对应 sprite 文件 treasure-chest.png）。
    只在 `pool: [ ... ]` 这一段范围内匹配，避免误配 manifest.js 其他同构对象。
    spriteFile 相对 app/web/assets/ 解析；audioFile 相对 app/web/ 解析
    （与 manifest.js 里两个字段的既有路径约定一致，已用磁盘文件核对过）。
    找不到文件或解析失败时返回空列表，调用方需处理空结果（不让生成器整体失败）。
    """
    path = REPO_ROOT / MANIFEST_JS_RELPATH
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"pool:\s*\[(.*?)\n(\s*)\],\n", text, re.S)
    if not m:
        return []
    body = m.group(1)
    out = []
    for word, sprite_file, audio_file in POOL_ITEM_RE.findall(body):
        out.append({
            "word": word,
            "sprite_relpath": f"app/web/assets/{sprite_file}",
            "audio_relpath": f"app/web/{audio_file}",
        })
    return out


def load_tts_text_manifest(relpath: str) -> dict:
    """加载 app/scripts/tts-text-manifest(.zh).json，用于按 out 路径反查任务文案。
    文件不存在/JSON 解析失败时返回空 dict（调用方按“找不到文案”处理，不让生成器崩溃）。
    """
    path = REPO_ROOT / relpath
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def build_out_index(manifest: dict) -> dict[str, dict[str, str]]:
    """把 tts-text-manifest(.zh).json 的 tasks/phrases 两段都摊平成
    {out路径(如 'audio/tasks/press-a.zh.m4a'): {taskId, text}}，供按音频文件名反查文案。"""
    idx: dict[str, dict[str, str]] = {}
    for section in ("tasks", "phrases"):
        for task_id, entry in (manifest.get(section) or {}).items():
            out = entry.get("out")
            if out:
                idx[out] = {"taskId": task_id, "text": entry.get("text", "")}
    return idx


def render_secret_word_audio_group() -> str:
    pool = parse_secret_word_pool()
    STATS["per_root"].append(("秘密词发音 EN+ZH（manifest.js secretWords.pool）", MANIFEST_JS_RELPATH, len(pool)))
    _ma = json.loads((REPO_ROOT / "app" / "web" / "audio" / "missing-audio.json").read_text(encoding="utf-8"))
    zh_delivered = set(e["word"] for e in _ma.get("secretWordsZh", []) if e.get("status") == "delivered")
    parts = [
        f'<h3 id="audio-words">秘密词发音（英文 + 中文） <span class="count">(共 {len(pool)} 词；中文已交付 {len(zh_delivered)}/{len(pool)})</span></h3>',
        '<p class="section-note">来源：app/web/manifest.js secretWords.pool[]。每词展示 sprite + <strong>英文发音</strong>'
        '（audio/words/&lt;word&gt;.m4a）与 <strong>中文发音</strong>（audio/words/&lt;word&gt;.zh.m4a，WTJ-20260706-011 '
        f'交付 {len(zh_delivered)}/{len(pool)} 条）。中文未交付的词（CosyVoice3 超短 ZH too-short 限制）标注「中文未交付·'
        'ZH 模式回落英文」，运行时无静音。preload="none" 避免一次性加载。</p>',
    ]
    if not pool:
        parts.append('<p class="section-note pending-note">未能从 manifest.js 解析出 secretWords.pool，请检查该文件结构是否变化。</p>')
        return "\n".join(parts)
    items = []
    for entry in pool:
        word = entry["word"]
        sprite_relpath = entry["sprite_relpath"]
        audio_relpath = entry["audio_relpath"]
        sprite_href = rel_href(sprite_relpath)
        audio_href = rel_href(audio_relpath)
        ALL_REFS.append((sprite_href, sprite_relpath))
        ALL_REFS.append((audio_href, audio_relpath))
        if word in zh_delivered:
            zh_relpath = f"app/web/audio/words/{word}.zh.m4a"
            zh_href = rel_href(zh_relpath)
            ALL_REFS.append((zh_href, zh_relpath))
            zh_block = (
                '<span class="zh-label">中文</span>'
                f'<audio controls preload="none" src="{esc(zh_href)}">您的浏览器不支持音频播放。</audio>'
                f'<code class="path">{esc(zh_relpath)}</code>'
            )
        else:
            zh_block = '<span class="zh-na">中文未交付·ZH 模式回落英文</span>'
        items.append(
            '<figure class="item audio-item">'
            f'<a href="{esc(sprite_href)}" target="_blank" rel="noopener" class="thumb-link">'
            f'<img src="{esc(sprite_href)}" loading="lazy" alt="{esc(word)}" /></a>'
            '<figcaption>'
            f'<span class="word-label">{esc(word)}</span>'
            '<span class="en-label">英文</span>'
            f'<audio controls preload="none" src="{esc(audio_href)}">您的浏览器不支持音频播放。</audio>'
            f'<code class="path">{esc(entry["audio_relpath"])}</code>'
            f'{zh_block}'
            '</figcaption>'
            '</figure>'
        )
    parts.append(f'<div class="grid">{"".join(items)}</div>')
    return "\n".join(parts)


def list_task_audio_files(zh: bool) -> list[str]:
    """列出 app/web/audio/tasks/ 下的 .m4a 文件名（不含目录），按 zh 参数筛选
    .zh.m4a（中文完整句）或非 .zh 的 .m4a（英文）。排序后返回，纯目录扫描，不硬编码文件名。
    """
    root = REPO_ROOT / "app/web/audio/tasks"
    if not root.exists():
        return []
    out = []
    for fn in sorted(os.listdir(root)):
        if not fn.endswith(".m4a"):
            continue
        if fn.endswith(".zh.m4a") == zh:
            out.append(fn)
    return out


def render_task_voice_group(zh: bool) -> str:
    anchor = "audio-tasks-zh" if zh else "audio-tasks-en"
    title = "中文任务语音" if zh else "英文任务语音（对照）"
    manifest_relpath = "app/scripts/tts-text-manifest.zh.json" if zh else "app/scripts/tts-text-manifest.json"
    manifest = load_tts_text_manifest(manifest_relpath)
    out_index = build_out_index(manifest)
    filenames = list_task_audio_files(zh)
    STATS["per_root"].append((title, "app/web/audio/tasks", len(filenames)))
    suffix_desc = "*.zh.m4a" if zh else "*.m4a（不含 .zh.m4a）"
    parts = [
        f'<h3 id="{esc(anchor)}">{esc(title)} <span class="count">(共 {len(filenames)} 条)</span></h3>',
        f'<p class="section-note">来源：app/web/audio/tasks/{esc(suffix_desc)}（目录扫描，新增文件重跑本脚本即出现）；'
        f'文案从 {esc(manifest_relpath)} 的 out 字段反查（找不到时标注“—”）。</p>',
    ]
    if not filenames:
        parts.append('<p class="section-note pending-note">（目录下未找到匹配文件）</p>')
        return "\n".join(parts)
    items = []
    for fn in filenames:
        repo_relpath = f"app/web/audio/tasks/{fn}"
        out_key = f"audio/tasks/{fn}"
        info = out_index.get(out_key)
        task_id = info["taskId"] if info else "—"
        text = info["text"] if info else "（未在 manifest 中找到对应文案）"
        href = rel_href(repo_relpath)
        ALL_REFS.append((href, repo_relpath))
        items.append(
            '<div class="audio-task-item">'
            f'<code class="task-id">{esc(task_id)}</code>'
            f'<span class="task-text">{esc(text)}</span>'
            f'<audio controls preload="none" src="{esc(href)}">您的浏览器不支持音频播放。</audio>'
            f'<code class="path">{esc(repo_relpath)}</code>'
            '</div>'
        )
    parts.append(f'<div class="audio-task-list">{"".join(items)}</div>')
    return "\n".join(parts)


def render_audio_preview_section() -> str:
    total_words = len(parse_secret_word_pool())
    total_zh = len(list_task_audio_files(zh=True))
    total_en = len(list_task_audio_files(zh=False))
    parts = [
        '<h2 id="audio-preview">音频试听专区 '
        f'<span class="count">(秘密词发音 {total_words} + 中文任务语音 {total_zh} + 英文任务语音 {total_en})</span></h2>',
        '<p class="section-note">Ethan 原话「不用跑 app 就能试听所有发音/任务语音」——本区不复制任何音频文件，'
        '只用原生 <code class="inline-code">&lt;audio controls preload="none"&gt;</code> 引用现有相对路径'
        '（非 &lt;script&gt;，符合 docs 零 JS 约束）。三组均为目录/manifest 自动扫描结果，新增音频后重跑'
        '<code class="inline-code">docs/scripts/gen-design-review.py</code> 即自动出现。</p>',
        '<div class="subnav">'
        '<a href="#audio-words">秘密词英文发音</a>'
        '<a href="#audio-tasks-zh">中文任务语音</a>'
        '<a href="#audio-tasks-en">英文任务语音</a>'
        '</div>',
        render_secret_word_audio_group(),
        render_task_voice_group(zh=True),
        render_task_voice_group(zh=False),
    ]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# WTJ-20260706-008：CosyVoice3 音频修复 before/after 试听专区（Ethan 主观裁决用）。
# before = 现役 stage 音频，直接引用其 tracked 实路径（app/web/audio/**，与 dist-stage 的
# before/ 逐字节一致）；after = 改进的短连续参考重生成候选，committed 到 tracked 的
# docs/assets/008-audio-review/after/，使本专区自包含、可从任意 origin/stage 检出复现。
# 纯 <audio> 相对引用，符合 docs 零 JS 约束。
# ---------------------------------------------------------------------------

AFTER_DIR_008 = "docs/assets/008-audio-review/after"

CLIPS_008 = [
    {"id": "apple", "kind": "秘密词", "text": "apple",
     "before": "app/web/audio/words/apple.m4a"},
    {"id": "banana", "kind": "秘密词（美式发音已验收 = 候选 #3/alt3，已固化为正式 banana.m4a）", "text": "banana",
     "before": "app/web/audio/words/banana.m4a"},
    {"id": "yoyo", "kind": "秘密词", "text": "yoyo",
     "before": "app/web/audio/words/yoyo.m4a"},
    # WTJ-20260706-009：原 click-faucet-on「Turn on the water」before/after 对照已整条移除。
    # faucet EN 任务语义已由 009（已验收）从 turn-on 翻转为 turn-off，"Turn on the water" 音频
    # 退役、不再随 app 交付（app/web/audio/tasks/click-faucet-on.m4a 已改名删除），该音质对照
    # 因此作废；008 当时的 after 历史件仍 committed 在 docs/assets/008-audio-review/after/，git
    # provenance 不丢，这里删掉的只是 live 面板里指向已删除文件的断链引用。新的关水语音
    # click-faucet-off（EN+ZH）已在本页「英文/中文任务语音」区可试听（那两区目录扫描自动收录）。
    {"id": "press-m.zh", "kind": "中文任务（第三版·4 候选待 Ethan 挑）", "text": "按下字母 M！",
     "before": "app/web/audio/tasks/press-m.zh.m4a",
     "after_alts": ["press-m.zh.alt2.m4a", "press-m.zh.alt3.m4a", "press-m.zh.alt4.m4a"],
     "after_alts_note": "press-m.zh 第三版返工：上方 AFTER = TL 按清晰度选的候选 #1（~2.1s 适中语速，避前两版 1.28s 太赶 / "
                        "3.2s 拖沓）；下面 3 个内容相同、音色略不同。请 Ethan 挑最干净的一版，告诉 TL 候选号（#1 = 上方 AFTER，或 #2~#4）。"},
    {"id": "fox", "kind": "秘密词（WTJ-20260706-015 新词）", "text": "fox",
     "before_missing": True},
]


def render_008_audio_fix_section() -> str:
    parts = [
        '<h2 id="008-audio-fix">008 音频修复 before/after 对照 '
        '<span class="count">(P0 · Ethan 主观裁决)</span></h2>',
        '<p class="section-note">卡片 WTJ-20260706-008：上一版 after 被 Ethan 拒收=<strong>文不对题</strong>'
        '（念的是 reference 句子而非目标词）。<strong>真因</strong>：CosyVoice3 zero-shot 对「单词/短目标」不稳——'
        '目标文本远短于 prompt_text 时模型会跑偏/复述参考（cosyvoice.py 的「synthesis text too short than prompt '
        'text」警告 + llm.py 把 prompt_text 与目标 concat）。<strong>修法</strong>：<strong>ASR-gated 重 seed</strong>'
        '——每条生成后用 whisper 自证念的是目标文本，不中就换随机种子重生成，命中才写盘；绝不 ship 文不对题音频。</p>',
        '<p class="section-note">本批<strong>已全部 ASR 自证内容正确</strong>：apple / banana / yoyo / fox → '
        '「Apple / Banana / Yo yo / Fox」；press-m.zh → 含「按下…M」。'
        '（原 click-faucet-on「Turn on the water」对照已由 WTJ-20260706-009 移除——faucet 任务语义翻转为'
        '关水，该英文句退役；新的关水语音见本页「英文/中文任务语音」区。）'
        'before = 现役 stage 音频（tracked <code class="inline-code">app/web/audio/**</code>）；after = ASR-gated '
        '重生成（committed 到 <code class="inline-code">docs/assets/008-audio-review/after/</code>）。fox 是 015 新词、'
        '此前无音频，故只有 after。<strong>TL 不试听；内容已技术自证，请 Ethan 只裁决主观音色/自然度。</strong></p>',
    ]
    items = []
    for c in CLIPS_008:
        cid = c["id"]
        after_rel = f"{AFTER_DIR_008}/{cid}.m4a"
        after_href = rel_href(after_rel)
        after_block = (
            '<div class="ab-col">'
            '<span class="ab-label">AFTER（ASR 自证）</span>'
            f'<audio controls preload="none" src="{esc(after_href)}">您的浏览器不支持音频播放。</audio>'
            f'<code class="path">{esc(after_rel)}</code>'
            '</div>'
        )
        if c.get("before_missing"):
            before_block = (
                '<div class="ab-col ab-missing">'
                '<span class="ab-label">BEFORE</span>'
                '<span class="ab-na">（015 新词，此前无音频）</span>'
                '</div>'
            )
        else:
            before_rel = c["before"]
            before_href = rel_href(before_rel)
            before_block = (
                '<div class="ab-col"><span class="ab-label">BEFORE</span>'
                f'<audio controls preload="none" src="{esc(before_href)}">您的浏览器不支持音频播放。</audio>'
                f'<code class="path">{esc(before_rel)}</code></div>'
            )
        alts_block = ''
        if c.get("after_alts"):
            alt_ctrls = ''.join(
                '<div class="ab-col"><span class="ab-label">候选 ' + str(i + 2) + '</span>'
                '<audio controls preload="none" src="' + esc(rel_href(AFTER_DIR_008 + "/" + a)) + '">您的浏览器不支持音频播放。</audio>'
                '<code class="path">' + esc(AFTER_DIR_008 + "/" + a) + '</code></div>'
                for i, a in enumerate(c["after_alts"])
            )
            alts_block = (
                '<p class="ab-q"><strong>' + esc(c.get("after_alts_note",
                    "返工多候选：上方 AFTER = 候选 #1（TL 按清晰度选）；下面是其余候选，内容相同、音色/参数不同。"
                    "请 Ethan 挑最合适的一版，告诉 TL 候选号（#1 = 上方 AFTER，或 #2 起往下），TL 即定为正式版。")) + '</strong></p>'
                '<div class="ab-cols">' + alt_ctrls + '</div>'
            )
        items.append(
            '<div class="ab-item">'
            f'<div class="ab-head"><code class="task-id">{esc(cid)}</code>'
            f'<span class="task-kind">{esc(c["kind"])}</span>'
            f'<span class="task-text">{esc(c["text"])}</span></div>'
            '<div class="ab-cols">'
            f'{before_block}'
            f'{after_block}'
            '</div>'
            f'{alts_block}'
            '</div>'
        )
    parts.append(f'<div class="ab-list">{"".join(items)}</div>')
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 动效对比专区（验收 4）：docs 设计源 vs app/web 运行时，逐动效并排。
# ---------------------------------------------------------------------------

CREATURES = [
    {
        "id": "faucet",
        "label": "水龙头 faucet",
        "docs_dir": "docs/assets/production-animations-v1/faucet",
        "runtime_dir": "app/web/assets/anim/faucet",
        "note": (
            "关联卡 WTJ-20260704-026 / 返工 WTJ-20260705-005：docs 源已将 running/closing 水柱"
            "调整为出水口尺度（约 130-140px 宽），需与运行时 sheet 并排核对宽度是否同步（关联卡 020）。"
        ),
    },
    {
        "id": "horse",
        "label": "小马 horse",
        "docs_dir": "docs/assets/production-animations-v1/horse",
        "runtime_dir": "app/web/assets/anim/horse",
        "note": "关联卡 WTJ-20260704-026：run 循环已改为真实腿部姿态变化（不再用切片旋转冒充奔跑）。",
    },
    {
        "id": "lamp",
        "label": "台灯 lamp",
        "docs_dir": "docs/assets/production-animations-v1/lamp",
        "runtime_dir": "app/web/assets/anim/lamp",
        "note": "关联卡 WTJ-20260704-026：开/关灯与过渡帧对比。",
    },
    {
        "id": "treasure-chest",
        "label": "宝箱 treasure-chest",
        "docs_dir": "docs/assets/production-animations-v1/treasure-chest",
        "runtime_dir": "app/web/assets/anim/treasure-chest",
        "note": "关联卡 WTJ-20260704-026：开盖改为五个真实关键姿态，放弃逐帧像素连续性以换取结构可信度。",
    },
    {
        "id": "door",
        "label": "门 door",
        "docs_dir": "docs/assets/production-animations-v1/door",
        "runtime_dir": "app/web/assets/anim/door",
        "note": (
            "运行时：已接入（WTJ-20260705-025）。门 v1 动画（卡 WTJ-20260704-030，DESIGN 验收 done）"
            "已从 v1_boundary.deferred_to_v2 移入 included、降采进 app/web/assets/anim/door 并登记 "
            "PROP_ANIM_STATE_MAP（closed→opening）。click-door-open 点击任务由静态 img 升级为真实开门帧动画。"
        ),
    },
    {
        "id": "bell",
        "label": "铃铛 bell",
        "docs_dir": "docs/assets/production-animations-v1/bell",
        "runtime_dir": "app/web/assets/anim/bell",
        "note": (
            "运行时：已接入（WTJ-20260705-025）。铃铛 v1 动画（卡 WTJ-20260704-031，DESIGN 验收 done）"
            "已从 v1_boundary.deferred_to_v2 移入 included、降采进 app/web/assets/anim/bell 并登记 "
            "PROP_ANIM_STATE_MAP（idle→ring）。click-doorbell-ring 点击任务由静态 img 升级为真实摇铃帧动画。"
        ),
    },
]


def render_compare_section() -> str:
    parts = [
        '<h2 id="compare">动效对比专区：docs 设计源 vs app/web 运行时 <span class="count">(重点，关联卡 020)</span></h2>',
        '<p class="section-note">每个动效道具左右并排展示：左侧是 docs/assets/production-animations-v1 下的设计源'
        '（contact sheet + 各状态 sheet），右侧是 app/web/assets/anim 下真正被引擎加载的 sheet。'
        'WTJ-20260705-025 起 door / bell 的 v1 动画（卡 -030/-031 已 DESIGN 验收）已接入运行时，'
        '六个道具的右列均有对应 app/web 运行时 sheet。</p>',
    ]
    for creature in CREATURES:
        docs_dir = creature["docs_dir"]
        runtime_dir = creature["runtime_dir"]
        docs_root = Path(REPO_ROOT / docs_dir)
        docs_files: list[str] = []
        if docs_root.exists():
            contact_sheets = sorted(
                f for f in list_files(docs_dir) if Path(f).name.endswith("-contact-sheet.png")
            )
            sheets_dir_files = sorted(f for f in list_files(docs_dir) if "/sheets/" in f)
            docs_files = contact_sheets + sheets_dir_files
        runtime_files: list[str] = []
        if runtime_dir:
            runtime_files = list_files(runtime_dir)

        parts.append(f'<h3 id="compare-{esc(creature["id"])}">{esc(creature["label"])}</h3>')
        parts.append(f'<p class="section-note">{creature["note"]}</p>')
        parts.append('<div class="compare-row">')
        parts.append('<div class="compare-col">')
        parts.append(f'<h4>docs 设计源（{esc(docs_dir)}）</h4>')
        if docs_files:
            items = "".join(render_item(f, docs_dir) for f in docs_files)
            parts.append(f'<div class="grid">{items}</div>')
        else:
            parts.append('<p class="section-note">（未找到 contact-sheet / sheets 文件）</p>')
        parts.append('</div>')
        parts.append('<div class="compare-col">')
        if runtime_dir:
            parts.append(f'<h4>运行时 app/web（{esc(runtime_dir)}）</h4>')
            if runtime_files:
                items = "".join(render_item(f, runtime_dir) for f in runtime_files)
                parts.append(f'<div class="grid">{items}</div>')
            else:
                parts.append('<p class="section-note">（运行时目录为空）</p>')
        else:
            parts.append('<h4>运行时 app/web</h4>')
            parts.append('<p class="pending-note">待接入 —— 无对应运行时文件（素材未验收，见上方说明）。</p>')
        parts.append('</div>')
        parts.append('</div>')
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 设计扩展 v2（11 类），每类内部再按子目录分组，附带类内跳转导航。
# ---------------------------------------------------------------------------

EXPANSION_V2_CATEGORIES = [
    ("backgrounds", "背景"),
    ("discovery-icons", "探索图标"),
    ("drag-success", "拖拽成功动效"),
    ("find-targets", "寻找目标 + 悬停反馈"),
    ("keyboard-milestone", "键盘里程碑"),
    ("pointer-trail", "鼠标尾迹视觉 token"),
    ("reward-stickers", "奖励贴纸"),
    ("secret-word-motion-samples", "秘密词轻动效样例"),
    ("task-props-v2", "未来任务道具 v2"),
    ("terminal-prompt-decoration", "终端提示符装饰"),
    ("work-complete-reward", "今日工作完成奖励"),
]


def render_expansion_v2_section() -> str:
    root_relpath = "docs/assets/design-expansion-v2"
    total = len(list_files(root_relpath))
    STATS["per_root"].append(("设计扩展候选 v2（11 类合计）", root_relpath, total))
    parts = [f'<h2 id="expansion-v2">设计扩展候选 v2（11 类） <span class="count">(共 {total} 项)</span></h2>']
    parts.append(
        '<p class="section-note">本组全部为 PM/Ethan 评审候选包（多数 README 明确写明'
        '“非自动运行时接入”），统一标记为“待接入”；键盘里程碑 / 秘密词动效样例等已复用生产级验收素材作为源图，'
        '标签规则见页首图例。</p>'
    )
    parts.append('<div class="subnav">')
    for slug, cn in EXPANSION_V2_CATEGORIES:
        parts.append(f'<a href="#dev2-{esc(slug)}">{esc(cn)}</a>')
    parts.append('</div>')
    for slug, cn in EXPANSION_V2_CATEGORIES:
        sub_root = f"{root_relpath}/{slug}"
        parts.append(render_source_root(sub_root, f"{cn}（{slug}）", f"dev2-{slug}"))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 需求设计文档 docs/design（纯 md 规格文档，非图像）
# ---------------------------------------------------------------------------

def render_design_docs_section() -> str:
    root_relpath = "docs/design"
    files = list_files(root_relpath)
    STATS["per_root"].append(("需求设计文档", root_relpath, len(files)))
    parts = [f'<h2 id="design-docs">需求设计文档 <span class="count">(共 {len(files)} 项)</span></h2>']
    parts.append('<p class="section-note">docs/design 下的 Markdown 规格文档，对应各设计扩展 v2 候选包的正式 spec。</p>')
    items = "".join(render_item(f, root_relpath) for f in files)
    parts.append(f'<div class="grid">{items}</div>')
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 运行时已接入
# ---------------------------------------------------------------------------

def render_runtime_section() -> str:
    parts = ['<h2 id="runtime">运行时已接入素材（app/web/assets/**、app/web/anim）</h2>']
    parts.append('<p class="section-note">这些文件被运行版 app/web 实际引用：秘密词 sprite、任务道具、'
                 '奖励贴纸、HUD UI 元素、动效帧序列 sheet 及播放引擎 API 文档。这是 Ethan 验收标准 #2 '
                 '点名要看的“运行版已接入素材”。sprites 共 100+ 张，已用 loading=lazy + 缩略图网格，页面不卡。</p>')
    # 注意:每个 root 的计数由 render_source_root 自己写入 STATS["per_root"](title 即下方传入值),
    # 这里不重复 append,避免同一 root 出现两条统计。
    for root_relpath, title, anchor in [
        ("app/web/assets/sprites", "运行时 - 秘密词 sprite", "runtime-sprites"),
        ("app/web/assets/task-props", "运行时 - 任务道具", "runtime-task-props"),
        ("app/web/assets/rewards", "运行时 - 奖励贴纸", "runtime-rewards"),
        ("app/web/assets/ui", "运行时 - UI 元素", "runtime-ui"),
        ("app/web/assets/anim", "运行时 - 动效帧序列 sheet", "runtime-anim"),
        ("app/web/anim", "运行时 - 动效引擎 API 文档", "runtime-api"),
    ]:
        parts.append(render_source_root(root_relpath, title, anchor))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 生产素材 Pack A / Pack B
# ---------------------------------------------------------------------------

def render_pack_a_section() -> str:
    return render_source_root("docs/assets/production-pack-a", "生产素材 Pack A", "pack-a")


def render_pack_b_section() -> str:
    return render_source_root(
        "docs/assets/production-pack-b",
        "生产素材 Pack B（活跃秘密词 99 词）",
        "pack-b",
        note="对应飞书卡 WTJ-20260704-006；stubs/ 下的占位素材已不再被 manifest 引用，标记为「疑似旧版」。",
    )


# ---------------------------------------------------------------------------
# 生产动效 v1（含 6 个创作对象 + 顶层 contact-sheets/previews/source）
# ---------------------------------------------------------------------------

ANIM_V1_CREATURES = ["bell", "door", "faucet", "horse", "lamp", "treasure-chest"]


def render_anim_v1_section() -> str:
    root_relpath = "docs/assets/production-animations-v1"
    total = len(list_files(root_relpath))
    STATS["per_root"].append(("生产动效 v1（合计）", root_relpath, total))
    parts = [f'<h2 id="anim-v1">生产动效 v1 <span class="count">(共 {total} 项)</span></h2>']
    parts.append(
        '<p class="section-note">对应卡 WTJ-20260704-026。faucet/horse/lamp/treasure-chest 已在 '
        '<a href="#compare">动效对比专区</a> 中与运行时并排展示；door/bell 素材质量未验收，未接入引擎。'
        '本节展示每个创作对象的完整帧序列（状态目录 + sheets + contact sheet）。</p>'
    )
    parts.append('<div class="subnav">')
    for c in ANIM_V1_CREATURES:
        parts.append(f'<a href="#anim-v1-{esc(c)}">{esc(c)}</a>')
    parts.append('<a href="#anim-v1-shared">顶层共享文件</a>')
    parts.append('</div>')
    for c in ANIM_V1_CREATURES:
        parts.append(render_source_root(f"{root_relpath}/{c}", f"{c}", f"anim-v1-{c}"))
    # 顶层共享（contact-sheets/previews/source + README/manifest）
    shared_files = list_files(root_relpath, exclude_top_subdirs=set(ANIM_V1_CREATURES))
    parts.append(f'<h3 id="anim-v1-shared">顶层共享文件 <span class="count">({len(shared_files)})</span></h3>')
    groups: dict[str, list[str]] = {}
    loose: list[str] = []
    for f in shared_files:
        rel = Path(f).relative_to(root_relpath)
        if len(rel.parts) == 1:
            loose.append(f)
        else:
            groups.setdefault(rel.parts[0], []).append(f)
    for subdir in sorted(groups):
        parts.append(render_group(f"{subdir}", sorted(groups[subdir]), root_relpath))
    if loose:
        parts.append(render_group("(根目录参考文件)", sorted(loose), root_relpath))
    return "\n".join(parts)


def render_style_section() -> str:
    return render_source_root("docs/assets/style", "视觉风格设计稿", "style")


def render_docs_sprites_section() -> str:
    return render_source_root(
        "docs/assets/sprites",
        "生产素材 - sprite 生产基准 v3",
        "docs-sprites",
        note="对应飞书卡 WTJ-20260703-007（已验收）。含 production-sprite-contact-sheet / "
             "-sheet-source / -sheet-alpha 及 dog/cat/apple/ball/star/car/basket/treasure-chest 单体基准；"
             "运行时 app/web/assets/sprites 的秘密词素材以此为风格基线。",
    )


def render_docs_states_loose_section() -> str:
    """docs/assets/states 状态图 + docs/assets 顶层散图（accepted-mvp-mockup 等），均为方向示意设计稿。"""
    states_files = list_files("docs/assets/states")
    loose_files = list_files_top_only("docs/assets")
    STATS["per_root"].append(("核心状态图设计稿", "docs/assets/states", len(states_files)))
    STATS["per_root"].append(("docs/assets 顶层散图（仅直接子文件）", "docs/assets (顶层)", len(loose_files)))
    total = len(states_files) + len(loose_files)
    parts = [f'<h2 id="docs-states">核心状态图与顶层方向 mock <span class="count">(共 {total} 项)</span></h2>']
    parts.append('<p class="section-note">docs/assets/states 的核心状态图与 docs/assets 顶层散落的方向 mock。'
                 '其中 accepted-mvp-mockup.png 是重要的验收基准图，Ethan 会想对照。'
                 '顶层组仅收 docs/assets 直接子文件，不与已单独成组的子目录重复。</p>')
    parts.append(render_group("docs/assets/states 状态图", states_files, "docs/assets/states", anchor="docs-states-0"))
    parts.append(render_group("docs/assets 顶层散图", loose_files, "docs/assets", anchor="docs-states-1"))
    return "\n".join(parts)


def render_briefs_section() -> str:
    return render_source_root(".agents/briefs/design", "设计需求简报", "briefs")


# ---------------------------------------------------------------------------
# 组装 + 断链检查
# ---------------------------------------------------------------------------

CSS = """
:root {
  --bg: #0e1117; --panel: #171d27; --panel-2: #202838; --ink: #f4f7fb; --muted: #aab4c3;
  --line: rgba(255,255,255,.12); --yellow: #ffd95a; --cyan: #5ee7ff; --coral: #ff7a77;
  --green: #8df27c; --pink: #ff8df4; --ok: #57e389; --warn: #ffd36e; --bad: #ff7b7b;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin:0; color:var(--ink); background:linear-gradient(180deg,#0b0e14 0%,#111722 46%,#0d1118 100%); }
a { color: var(--cyan); }
.page { width: min(1400px, calc(100% - 32px)); margin:0 auto; padding: 22px 0 80px; }
header.top { padding: 10px 0 18px; border-bottom:1px solid var(--line); }
h1 { font-size: clamp(26px,4vw,40px); margin: 0 0 8px; }
.subtitle { color:#d9e2ef; line-height:1.6; margin:0 0 10px; }
.stats-bar { display:flex; flex-wrap:wrap; gap:10px; margin:14px 0; }
.stat-pill { border:1px solid var(--line); background:rgba(255,255,255,.045); border-radius:8px; padding:8px 12px; font-size:13px; color:var(--muted); }
.stat-pill strong { color:#fff; }
.legend { display:flex; flex-wrap:wrap; gap:8px; margin: 10px 0 4px; font-size:12px; color:var(--muted); }
nav.pagenav { position:sticky; top:0; z-index:30; display:flex; gap:6px; flex-wrap:wrap; padding:10px 0; background:rgba(14,17,23,.94); backdrop-filter:blur(12px); border-bottom:1px solid var(--line); }
nav.pagenav a { flex:0 0 auto; padding:6px 10px; border-radius:999px; background:rgba(255,255,255,.05); border:1px solid transparent; font-size:12.5px; color:#d7dfeb; text-decoration:none; }
nav.pagenav a:hover { border-color: rgba(94,231,255,.4); }
.subnav { display:flex; flex-wrap:wrap; gap:6px; margin: 6px 0 14px; }
.subnav a { font-size:12px; padding:4px 9px; border-radius:999px; background:rgba(255,255,255,.04); border:1px solid var(--line); color:#cfe3ee; text-decoration:none; }
section.block { padding: 34px 0 6px; scroll-margin-top: 96px; border-top:1px solid var(--line); }
section.block:first-of-type { border-top:none; }
h2 { font-size:24px; margin: 0 0 8px; scroll-margin-top:96px; }
h3 { font-size:16px; margin: 18px 0 8px; color:#fff; scroll-margin-top:96px; }
h4 { font-size:13px; margin:0 0 8px; color:var(--muted); text-transform:uppercase; letter-spacing:.02em; }
.count { color: var(--muted); font-weight: 400; font-size: 0.7em; }
.section-note { color:var(--muted); font-size:13px; line-height:1.6; max-width:1100px; }
.pending-note { color: var(--warn); font-size:13px; }
.grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap:12px; margin: 6px 0 16px; }
.item { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:rgba(255,255,255,.03); display:flex; flex-direction:column; }
.thumb-link { display:block; background:#05070b; }
.item img { display:block; width:100%; height:120px; object-fit:contain; background:#05070b; }
.file-chip { display:flex; flex-direction:column; align-items:center; justify-content:center; height:120px; gap:6px; text-decoration:none; padding:8px; text-align:center; }
.file-ext { font-size:11px; font-weight:700; color:#111723; background:var(--cyan); border-radius:4px; padding:2px 6px; }
.file-name { font-size:10.5px; color:var(--muted); word-break:break-all; }
.item figcaption { padding:6px 7px 8px; display:flex; flex-direction:column; gap:3px; }
.tag { display:inline-flex; align-self:flex-start; padding:2px 7px; border-radius:999px; font-size:10.5px; border:1px solid transparent; }
.tag-runtime { background:rgba(87,227,137,.14); border-color:rgba(87,227,137,.32); color:#dfffea; }
.tag-prod { background:rgba(94,231,255,.12); border-color:rgba(94,231,255,.3); color:#d9fbff; }
.tag-design { background:rgba(136,167,255,.14); border-color:rgba(136,167,255,.32); color:#e4eaff; }
.tag-pending { background:rgba(255,211,110,.13); border-color:rgba(255,211,110,.3); color:#fff2cc; }
.tag-stale { background:rgba(255,123,123,.13); border-color:rgba(255,123,123,.3); color:#ffe2e2; }
.path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:9.5px; color:#cfe3ee; word-break:break-all; line-height:1.3; }
.cards { font-size:9.5px; color:var(--muted); }
.compare-row { display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:22px; }
.compare-col { border:1px solid var(--line); border-radius:8px; padding:10px; background:rgba(255,255,255,.02); }
@media (max-width: 860px) { .compare-row { grid-template-columns: 1fr; } }
.audio-item .word-label { font-weight:600; color:#fff; font-size:12.5px; }
.audio-item audio { width:100%; height:30px; margin:2px 0; }
.audio-task-list { display:flex; flex-direction:column; gap:8px; margin: 6px 0 20px; }
.audio-task-item { display:grid; grid-template-columns: 150px 1fr 260px; gap:10px 14px; align-items:center; border:1px solid var(--line); border-radius:8px; padding:9px 12px; background:rgba(255,255,255,.03); }
.audio-task-item .task-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:11px; color:#cfe3ee; }
.audio-task-item .task-text { font-size:14px; color:#fff; }
.audio-task-item audio { width:100%; height:30px; }
.audio-task-item .path { grid-column: 1 / -1; }
@media (max-width: 760px) { .audio-task-item { grid-template-columns: 1fr; } }
.ab-list { display:flex; flex-direction:column; gap:12px; margin: 6px 0 20px; }
.ab-item { border:1px solid var(--line); border-radius:8px; padding:11px 13px; background:rgba(255,255,255,.03); }
.ab-head { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 12px; margin-bottom:9px; }
.ab-head .task-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:11px; color:#cfe3ee; }
.ab-head .task-kind { font-size:11px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:1px 8px; }
.ab-head .task-text { font-size:14px; color:#fff; }
.ab-cols { display:grid; grid-template-columns: 1fr 1fr; gap:10px 14px; }
.ab-col { display:flex; flex-direction:column; gap:5px; border:1px solid var(--line); border-radius:6px; padding:8px 10px; background:rgba(255,255,255,.02); }
.ab-col .ab-label { font-size:10.5px; font-weight:700; letter-spacing:.08em; color:#9fb3c8; }
.ab-col audio { width:100%; height:30px; }
.ab-missing { justify-content:center; align-items:center; color:var(--muted); border-style:dashed; }
.ab-missing .ab-na { font-size:12px; }
.ab-q { margin:9px 0 0; font-size:12.5px; color:#e5c07b; line-height:1.55; }
@media (max-width: 760px) { .ab-cols { grid-template-columns: 1fr; } }
.inline-code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background:rgba(255,255,255,.06); padding:1px 5px; border-radius:4px; }
#broken ul { line-height:1.8; }
#broken .ok { color: var(--ok); }
#broken .bad { color: var(--bad); }
footer.page-footer { margin-top:50px; padding-top:18px; border-top:1px solid var(--line); color:var(--muted); font-size:12.5px; line-height:1.7; }
"""


def build_body_sections() -> list[tuple[str, str]]:
    """只应调用一次：内部会触发 render_item，产生 STATS / ALL_REFS 的副作用。"""
    return [
        ("audio-preview", render_audio_preview_section()),
        ("008-audio-fix", render_008_audio_fix_section()),
        ("compare", render_compare_section()),
        ("runtime", render_runtime_section()),
        ("pack-a", render_pack_a_section()),
        ("pack-b", render_pack_b_section()),
        ("anim-v1", render_anim_v1_section()),
        ("docs-sprites", render_docs_sprites_section()),
        ("expansion-v2", render_expansion_v2_section()),
        ("style", render_style_section()),
        ("docs-states", render_docs_states_loose_section()),
        ("design-docs", render_design_docs_section()),
        ("briefs", render_briefs_section()),
    ]


def assemble_html(body_sections: list[tuple[str, str]], broken_html: str, stats_bar_html: str) -> str:
    """纯字符串拼装，不触发任何 render_item 副作用，可安全多次调用。"""
    header = f"""<header class="top">
  <h1>WorkTime Justin 设计总览 —— 历史 DESIGN 产出全量画廊</h1>
  <p class="subtitle">卡片 WTJ-20260705-021（返工 021b：新增「音频试听专区」，不用跑 app 就能试听所有发音/任务语音）。
  汇总 docs/assets/style、docs/assets/sprites、docs/assets/states、
  docs/assets 顶层散图、docs/design、docs/assets/design-expansion-v2（11 类）、docs/assets/production-animations-v1、
  docs/assets/production-pack-a、docs/assets/production-pack-b、.agents/briefs/design、
  app/web/assets/sprites、app/web/assets/task-props、app/web/assets/rewards、app/web/assets/ui、
  app/web/assets/anim、app/web/anim、app/web/audio/words、app/web/audio/tasks 下的全部历史设计产出与音频，
  供 Ethan 一次性目视 + 试听验收。本页只引用现有文件的相对路径，
  不复制任何素材；由 <code class="inline-code">docs/scripts/gen-design-review.py</code> 生成，可重新运行以覆盖更新。</p>
  <div class="legend">
    <span class="tag tag-runtime">运行时已接入</span>
    <span class="tag tag-prod">生产素材</span>
    <span class="tag tag-design">设计稿</span>
    <span class="tag tag-pending">待接入</span>
    <span class="tag tag-stale">疑似旧版</span>
    <span>（标签规则：主要按所属目录判定；app/web/assets/** 全部为“运行时已接入”（优先于文件名关键字）；docs 下 stub/placeholder 关键字覆盖为“疑似旧版”；design-expansion-v2 下候选包整体记「待接入」，因其 README 普遍声明非自动运行时接入）</span>
  </div>
  <div class="stats-bar">{stats_bar_html}</div>
</header>

<nav class="pagenav" aria-label="设计总览页导航">
  <a href="#audio-preview">音频试听专区</a>
  <a href="#008-audio-fix">008 音频修复对照</a>
  <a href="#compare">动效对比专区</a>
  <a href="#runtime">运行时已接入</a>
  <a href="#pack-a">生产素材 Pack A</a>
  <a href="#pack-b">生产素材 Pack B</a>
  <a href="#anim-v1">生产动效 v1</a>
  <a href="#docs-sprites">sprite 生产基准</a>
  <a href="#expansion-v2">设计扩展候选 v2</a>
  <a href="#style">视觉风格设计稿</a>
  <a href="#docs-states">状态图与顶层 mock</a>
  <a href="#design-docs">需求设计文档</a>
  <a href="#briefs">设计需求简报</a>
  <a href="#broken">断链/待补清单</a>
</nav>
"""

    main_parts = []
    for anchor, content in body_sections:
        main_parts.append(f'<section class="block" id="sec-{esc(anchor)}" aria-labelledby="{esc(anchor)}">{content}</section>')

    main_parts.append(f'<section class="block" id="broken" aria-labelledby="broken">{broken_html}</section>')

    footer = """<footer class="page-footer">
  由 docs/scripts/gen-design-review.py 自动生成（可重复运行覆盖更新）；卡片 WTJ-20260705-021。
  不复制任何素材，全部为相对路径引用；如目录新增/移动文件，重跑生成器即可同步。
</footer>"""

    doc = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="WorkTime Justin 历史 DESIGN 产出全量总览（WTJ-20260705-021），供 Ethan 一次性目视验收。" />
<title>WorkTime Justin / 设计总览 —— 历史 DESIGN 产出</title>
<style>{CSS}</style>
</head>
<body>
<div class="page">
{header}
<main id="main">
{''.join(main_parts)}
</main>
{footer}
</div>
</body>
</html>
"""
    return doc


def check_links(html_text: str) -> tuple[int, int, list[str]]:
    """从生成的 HTML 中提取所有本地 src/href（排除锚点、外部链接），逐一验证磁盘存在。
    返回 (总数, 缺失数, 缺失清单文本行)。
    """
    refs = set()
    for m in re.finditer(r'(?:src|href)="([^"]+)"', html_text):
        ref = m.group(1)
        if ref.startswith("#") or ref.startswith("http://") or ref.startswith("https://") or ref.startswith("mailto:"):
            continue
        refs.add(ref)
    missing = []
    for ref in sorted(refs):
        target = (DOCS_DIR / ref).resolve()
        if not target.exists():
            missing.append(ref)
    return len(refs), len(missing), missing


def build_stats_bar() -> str:
    total = STATS["total_items"]
    parts = [f'<span class="stat-pill"><strong>{total}</strong> 个条目（图片/参考文件）</span>']
    for tag, cnt in sorted(STATS["tag_counts"].items(), key=lambda kv: -kv[1]):
        parts.append(f'<span class="stat-pill">{esc(tag)}: <strong>{cnt}</strong></span>')
    return "".join(parts)


def main() -> None:
    # 只渲染一次主体（render_item 的副作用会把统计塞进 STATS / ALL_REFS 全局变量）。
    body_sections = build_body_sections()

    # 用一个占位 broken 区块先拼一版完整 HTML，仅用于给 check_links 提取 src/href 做静态检查；
    # 拼装本身是纯字符串操作，不会重新触发 render_item，因此不会导致统计翻倍。
    placeholder = '<h2 id="broken-h">断链 / 待补清单</h2><p class="section-note">生成中…</p>'
    probe_doc = assemble_html(body_sections, placeholder, "")
    total_refs, missing_count, missing = check_links(probe_doc)

    if missing:
        items = "".join(f'<li class="bad">{esc(m)}</li>' for m in missing)
        broken_html = (
            '<h2 id="broken-h">断链 / 待补清单</h2>'
            f'<p class="section-note bad">静态检查发现 {missing_count} 个失效引用（本地文件不存在），需要补齐或从生成器排除：</p>'
            f'<ul>{items}</ul>'
        )
    else:
        broken_html = (
            '<h2 id="broken-h">断链 / 待补清单</h2>'
            f'<p class="section-note ok">静态检查通过：共检查 {total_refs} 个本地资产引用，0 个缺失。</p>'
        )

    stats_bar = build_stats_bar()
    html_doc = assemble_html(body_sections, broken_html, stats_bar)

    OUTPUT.write_text(html_doc, encoding="utf-8")

    # ---- stdout 报告 ----
    print(f"已生成: {OUTPUT.relative_to(REPO_ROOT)}")
    print(f"总条目数（图片+参考文件）: {STATS['total_items']}")
    print("按 scan root 统计:")
    for title, root, n in STATS["per_root"]:
        print(f"  - {title} [{root}]: {n}")
    print("用途标签分布:")
    for tag, cnt in sorted(STATS["tag_counts"].items(), key=lambda kv: -kv[1]):
        print(f"  - {tag}: {cnt}")
    print(f"静态链接检查: 共 {total_refs} 个本地引用, 缺失 {missing_count} 个")
    if missing:
        print("缺失清单:")
        for m in missing:
            print(f"  ! {m}")


if __name__ == "__main__":
    main()
