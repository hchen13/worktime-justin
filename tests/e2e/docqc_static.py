#!/usr/bin/env python3
"""DOCQC static checks for the requirements doc (QA card WTJ-20260703-003).

Cases implemented (definitions in tests/e2e/docqc-cases.md):
  DOCQC-001 (static half)  HTML well-formedness & head sanity
  DOCQC-002                static resource reference integrity & portability
  DOCQC-004                10 requirement-domain coverage, scoped per
                           data-domain section, plus REQ inventory
                           reconciliation against the #coverage matrix
  DOCQC-005                decided-fact fidelity spot checks (scoped per
                           data-domain section)
  DOCQC-006                anchor navigation integrity

Design notes:
  * Zero dependencies beyond the Python 3 stdlib, so it can run anywhere.
  * The doc carries its own QA assertion contract: every atomic requirement
    is a node with data-req-id="REQ-{DOMAIN}-{NN}", every requirement domain
    is a section with data-domain="{DOMAIN}", and the #coverage matrix table
    declares, per domain: code / name / section anchor / REQ id range /
    count, plus a 合计 row. DOCQC-004 reconciles that declaration against
    the actual visible data-req-id nodes, so deleting a whole domain section
    (or hiding it) turns red even if stray mentions elsewhere (nav, captions,
    parameter tables) would satisfy concept regexes.
  * Concept/fact checks match regex groups against the visible text of the
    corresponding data-domain section slice only (style/script stripped,
    whitespace collapsed, img alt / aria-label included) — residue outside
    the owning section no longer feeds the regexes. Facts pin decisions,
    not wording; see the fixture _comment for the maintenance contract.
  * Visibility: subtrees carrying the `hidden` attribute or an inline
    style with display:none are excluded from the visible corpus and from
    section slices (and data-req-id nodes inside them do not count as
    definitions). Deeper hiding via CSS classes/stylesheets is out of reach
    for a static parser and is covered by the visual/browser tracks
    (DOCQC-003/007..012), which render the page for real.
  * Resource checks are case-exact on path components so a doc that opens on
    macOS (case-insensitive FS) does not silently break on GitHub Pages/Linux.
    Rendering resources must be relative (or data: URIs): file:, absolute
    paths and protocol-relative // references are non-portable and fail.
  * <nav> and role="navigation" are equivalent for DOCQC-006.

Usage:
  python3 tests/e2e/docqc_static.py [--doc docs/index.html] \
      [--fixture tests/fixtures/docqc_requirement_domains.json] \
      [--report tests/reports/docqc_static_report.json]

Exit codes:
  0 = all cases PASS (warnings allowed)
  1 = at least one case FAIL (legitimate red)
  2 = infrastructure error (doc/fixture missing or undecodable, fixture not
      valid JSON, ...): report is written with an "error" field so a harness
      can tell broken plumbing apart from a genuine documentation failure.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

REPO_ROOT = Path(__file__).resolve().parents[2]

RESOURCE_ATTRS = {
    "img": ["src", "srcset"],
    "source": ["src", "srcset"],
    "script": ["src"],
    "link": ["href"],
    "video": ["src", "poster"],
    "audio": ["src"],
    "iframe": ["src"],
    "embed": ["src"],
    "object": ["data"],
}

MAGIC = {
    ".png": b"\x89PNG\r\n\x1a\n",
    ".jpg": b"\xff\xd8",
    ".jpeg": b"\xff\xd8",
    ".gif": b"GIF8",
    ".webp": b"RIFF",
}

MIN_VISIBLE_TEXT_CHARS = 800

# Elements that never take a closing tag: they must not be pushed on the
# open-element stack or unclosed-tag recovery would mispop their ancestors.
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}

DISPLAY_NONE_RE = re.compile(r"display\s*:\s*none", re.IGNORECASE)
REQ_RANGE_RE = re.compile(
    r"REQ-([A-Z]+)-(\d+)\s*[~～\-–—]+\s*REQ-([A-Z]+)-(\d+)"
)
REQ_SINGLE_RE = re.compile(r"REQ-([A-Z]+)-(\d+)")


class DocParser(HTMLParser):
    """Collects visible text (global and per data-domain section slice),
    ids, hrefs, resource refs, data-req-id nodes, the #coverage matrix rows
    and head metadata. Subtrees with the `hidden` attribute or inline
    display:none are excluded from all visible-text collections."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.extra_text: list[str] = []  # alt / aria-label
        self.ids: list[tuple[str, str]] = []  # (tag, id)
        self.anchor_hrefs: list[tuple[str, bool]] = []  # (href, inside_nav)
        self.resource_refs: list[tuple[str, str, str]] = []  # (tag, attr, url)
        self.style_texts: list[str] = []
        self.has_doctype = False
        self.title = ""
        self.has_charset = False
        self.has_viewport = False
        self.html_lang: str | None = None
        self.nav_count = 0  # <nav> or role="navigation" elements
        # data-domain / data-req-id contract collections
        self.domain_text: dict[str, list[str]] = {}
        self.domain_sections: list[tuple[str, str, bool]] = []  # (domain, id, hidden)
        self.req_nodes: list[dict] = []  # {req_id, domain, hidden}
        self.has_coverage_section = False
        self.coverage_rows: list[list[str]] = []
        self._cov_row: list[str] | None = None
        self._cov_cell: list[str] | None = None
        self._in_title = False
        self._skip_text_tag: str | None = None  # style / script
        # open-element stack frames: dicts with tag/domain/hidden/nav/coverage
        self._stack: list[dict] = []

    # -- stack helpers ---------------------------------------------------
    def _top(self) -> dict | None:
        return self._stack[-1] if self._stack else None

    def _effective(self, tag: str, ad: dict) -> dict:
        parent = self._top()
        self_hidden = ("hidden" in ad) or bool(
            DISPLAY_NONE_RE.search(ad.get("style", ""))
        )
        self_nav = tag == "nav" or ad.get("role", "").strip().lower() == "navigation"
        return {
            "tag": tag,
            "domain": ad.get("data-domain") or (parent["domain"] if parent else None),
            "hidden": (parent["hidden"] if parent else False) or self_hidden,
            "nav": (parent["nav"] if parent else False) or self_nav,
            "coverage": (parent["coverage"] if parent else False)
            or ad.get("id") == "coverage",
            "self_nav": self_nav,
        }

    # -- parser callbacks ------------------------------------------------
    def handle_decl(self, decl: str) -> None:
        if decl.lower().startswith("doctype"):
            self.has_doctype = True

    def handle_starttag(self, tag: str, attrs) -> None:
        ad = {k.lower(): (v or "") for k, v in attrs}
        frame = self._effective(tag, ad)
        if tag == "html" and "lang" in ad:
            self.html_lang = ad["lang"]
        if tag == "meta":
            if "charset" in ad:
                self.has_charset = True
            if ad.get("name", "").lower() == "viewport":
                self.has_viewport = True
        if tag == "title":
            self._in_title = True
        if tag in ("style", "script"):
            self._skip_text_tag = tag
        if frame["self_nav"]:
            self.nav_count += 1
        if "id" in ad and ad["id"]:
            self.ids.append((tag, ad["id"]))
        if "data-domain" in ad and ad["data-domain"]:
            self.domain_sections.append(
                (ad["data-domain"], ad.get("id", ""), frame["hidden"])
            )
        if "data-req-id" in ad and ad["data-req-id"]:
            self.req_nodes.append(
                {
                    "req_id": ad["data-req-id"].strip(),
                    "domain": frame["domain"],
                    "hidden": frame["hidden"],
                }
            )
        if tag == "a" and "href" in ad:
            self.anchor_hrefs.append((ad["href"], frame["nav"]))
        for attr in RESOURCE_ATTRS.get(tag, []):
            if attr in ad and ad[attr]:
                if attr == "srcset":
                    for cand in ad[attr].split(","):
                        url = cand.strip().split()[0] if cand.strip() else ""
                        if url:
                            self.resource_refs.append((tag, attr, url))
                else:
                    self.resource_refs.append((tag, attr, ad[attr]))
        if "style" in ad:
            self.style_texts.append(ad["style"])
        if not frame["hidden"]:
            for key in ("alt", "aria-label"):
                if ad.get(key):
                    self.extra_text.append(ad[key])
                    if frame["domain"]:
                        self.domain_text.setdefault(frame["domain"], []).append(
                            ad[key]
                        )
        # coverage matrix table capture
        if frame["coverage"]:
            self.has_coverage_section = True
            if tag == "tr":
                self._cov_row = []
                self._cov_cell = None
            elif tag in ("td", "th") and self._cov_row is not None:
                self._cov_cell = []
        if tag not in VOID_TAGS:
            self._stack.append(frame)

    def handle_startendtag(self, tag: str, attrs) -> None:
        # self-closing form: run starttag side effects, never leave a frame
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS and self._stack and self._stack[-1]["tag"] == tag:
            self._stack.pop()

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag == self._skip_text_tag:
            self._skip_text_tag = None
        if self._top() and self._top()["coverage"]:
            if tag in ("td", "th") and self._cov_cell is not None:
                cell = re.sub(r"\s+", " ", " ".join(self._cov_cell)).strip()
                if self._cov_row is not None:
                    self._cov_row.append(cell)
                self._cov_cell = None
            elif tag == "tr" and self._cov_row is not None:
                if self._cov_row:
                    self.coverage_rows.append(self._cov_row)
                self._cov_row = None
        if tag in VOID_TAGS:
            return
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i]["tag"] == tag:
                del self._stack[i:]
                break

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        if self._skip_text_tag == "style":
            self.style_texts.append(data)
            return
        if self._skip_text_tag == "script":
            return
        top = self._top()
        if top and top["hidden"]:
            return
        if data.strip():
            self.text_parts.append(data)
            if top and top["domain"]:
                self.domain_text.setdefault(top["domain"], []).append(data)
            if top and top["coverage"] and self._cov_cell is not None:
                self._cov_cell.append(data)


def classify_url(url: str) -> str:
    u = url.strip()
    if not u:
        return "empty"
    if u.startswith("#"):
        return "fragment"
    if u.startswith("//"):
        return "protocol-relative"
    if u.startswith("/"):
        return "absolute"
    m = re.match(r"^([a-zA-Z][a-zA-Z0-9+.\-]*):", u)
    if m:
        scheme = m.group(1).lower()
        if scheme in ("http", "https"):
            return "external"
        if scheme == "data":
            return "data"
        return "other-scheme"  # file:, ftp:, chrome:, ... — non-portable
    return "local"


def case_exact_lookup(base_dir: Path, rel_url: str):
    """Resolve rel_url from base_dir checking each component with exact case.

    Returns (ok, resolved_path_or_reason).
    """
    path_part = urlsplit(rel_url).path
    rel = unquote(path_part)
    cur = base_dir
    parts = [p for p in PurePosixPath(rel).parts if p not in (".",)]
    if not parts:
        return False, "空路径"
    for part in parts:
        if part == "..":
            cur = cur.parent
            continue
        if part == "/":
            return False, f"绝对路径引用不可移植: {rel_url}"
        try:
            entries = os.listdir(cur)
        except (NotADirectoryError, FileNotFoundError):
            return False, f"父路径不存在或不是目录: {cur}"
        if part not in entries:
            ci = [e for e in entries if e.lower() == part.lower()]
            if ci:
                return False, f"大小写不匹配: 引用 '{part}' 磁盘为 '{ci[0]}' (在 {cur})"
            return False, f"文件缺失: {cur / part}"
        cur = cur / part
    if cur.is_dir():
        return False, f"引用指向目录而非文件: {cur}"
    return True, cur


def check_resource_file(path: Path):
    """Returns list of problem strings for an existing local resource file."""
    problems = []
    size = path.stat().st_size
    if size == 0:
        problems.append(f"0 字节文件: {path}")
        return problems
    magic = MAGIC.get(path.suffix.lower())
    if magic:
        with open(path, "rb") as fh:
            head = fh.read(len(magic))
        if head != magic:
            problems.append(f"文件头不是合法的 {path.suffix} 格式: {path}")
    elif path.suffix.lower() == ".svg":
        head = path.read_bytes()[:4096].decode("utf-8", "ignore")
        if "<svg" not in head:
            problems.append(f"SVG 文件缺少 <svg> 标签: {path}")
    return problems


def collapse_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s)


def parse_coverage_matrix(rows: list[list[str]]):
    """Parse #coverage table rows into (domain_decls, total, problems).

    domain_decls: {code: {"count": int, "anchor": str|None, "ids": [..]}}
    """
    decls: dict[str, dict] = {}
    total = None
    saw_total_row = False
    problems: list[str] = []
    for row in rows:
        if not row:
            continue
        first = row[0]
        if "合计" in first:
            saw_total_row = True
            # 合计行因 colspan 列数与表头不对应，且允许合法追加尾列（如备注），
            # 不能按固定下标取数：从右向左找第一个"纯数字"单元格作为合计条数。
            total_val = None
            for cell in reversed(row):
                if re.fullmatch(r"\d+", collapse_ws(cell).strip()):
                    total_val = int(collapse_ws(cell).strip())
                    break
            if total_val is not None:
                total = total_val
            else:
                problems.append(
                    f"coverage 矩阵合计行无法解析条数(找不到纯数字单元格): {row}"
                )
            continue
        if not re.fullmatch(r"[A-Z]{2,6}", first):
            continue  # header row or unrelated
        if len(row) < 5:
            problems.append(f"coverage 矩阵行列数不足: {row}")
            continue
        code, _name, anchor_cell, range_cell, count_cell = row[:5]
        if code in decls:
            problems.append(f"coverage 矩阵重复域码: {code}")
            continue
        m_anchor = re.search(r"#([\w-]+)", anchor_cell)
        anchor = m_anchor.group(1) if m_anchor else None
        if anchor is None:
            problems.append(f"coverage 矩阵 {code} 行章节锚点无法解析: {anchor_cell!r}")
        ids: list[str] = []
        m = REQ_RANGE_RE.search(range_cell)
        if m:
            c1, n1, c2, n2 = m.group(1), m.group(2), m.group(3), m.group(4)
            if c1 != code or c2 != code:
                problems.append(
                    f"coverage 矩阵 {code} 行 REQ 范围域码不一致: {range_cell!r}"
                )
            width = len(m.group(2))
            lo, hi = int(n1), int(n2)
            if lo > hi:
                problems.append(f"coverage 矩阵 {code} 行 REQ 范围倒序: {range_cell!r}")
                lo, hi = hi, lo
            ids = [f"REQ-{code}-{n:0{width}d}" for n in range(lo, hi + 1)]
        else:
            m1 = REQ_SINGLE_RE.search(range_cell)
            if m1:
                if m1.group(1) != code:
                    problems.append(
                        f"coverage 矩阵 {code} 行 REQ 范围域码不一致: {range_cell!r}"
                    )
                ids = [f"REQ-{m1.group(1)}-{m1.group(2)}"]
            else:
                problems.append(
                    f"coverage 矩阵 {code} 行 REQ ID 范围无法解析: {range_cell!r}"
                )
        digits = re.findall(r"\d+", count_cell)
        count = int(digits[-1]) if digits else None
        if count is None:
            problems.append(f"coverage 矩阵 {code} 行条数无法解析: {count_cell!r}")
        elif ids and count != len(ids):
            problems.append(
                f"coverage 矩阵 {code} 行条数({count})与 REQ 范围长度({len(ids)})不一致"
            )
        decls[code] = {"count": count, "anchor": anchor, "ids": ids}
    return decls, total, problems, saw_total_row


def check_req_reconciliation(parser: DocParser):
    """REQ inventory reconciliation: #coverage matrix vs data-req-id nodes.

    The doc's #coverage table declares itself『此表同时作为 QA 的断言清单』—
    this check enforces that contract (see fixture _comment)."""
    problems: list[str] = []
    has_req_nodes = bool(parser.req_nodes)
    if not parser.has_coverage_section and not has_req_nodes:
        problems.append(
            "契约缺失: 文档没有 #coverage 矩阵，也没有任何 data-req-id 节点。"
            "该文档的 QA 断言契约（coverage 矩阵 + REQ-域码-NN 节点，见 fixture "
            "_comment）是文档自带义务，请 TL 恢复后再交付。"
        )
        return {"status": "missing-contract", "problems": problems}
    if not parser.has_coverage_section or not parser.coverage_rows:
        problems.append(
            "契约缺失: 文档存在 data-req-id 节点但缺少可解析的 #coverage 矩阵表"
            "（矩阵自称『QA 的断言清单』，属于文档自带义务）"
        )
        return {"status": "missing-matrix", "problems": problems}

    decls, total, parse_problems, saw_total_row = parse_coverage_matrix(
        parser.coverage_rows
    )
    problems.extend(parse_problems)
    if not decls:
        problems.append("契约缺失: #coverage 矩阵没有任何可解析的域行")
        return {"status": "missing-matrix", "problems": problems}

    visible_ids = [n["req_id"] for n in parser.req_nodes if not n["hidden"]]
    hidden_ids = [n["req_id"] for n in parser.req_nodes if n["hidden"]]
    declared_ids = {rid for d in decls.values() for rid in d["ids"]}

    # duplicates among visible definitions
    seen: set[str] = set()
    for rid in visible_ids:
        if rid in seen:
            problems.append(f"REQ 定义节点重复: {rid} 在正文出现多于一次")
        seen.add(rid)

    def capped(items: list[str], fmt, label: str, cap: int = 6) -> None:
        # 矩阵解析错位等根因问题会让逐条清单爆炸成几十行级联噪音,
        # 淹没真正可行动的报错——超过 cap 条时聚合汇报。
        if len(items) <= cap:
            for it in items:
                problems.append(fmt(it))
        else:
            for it in items[:cap]:
                problems.append(fmt(it))
            problems.append(
                f"…… {label}共 {len(items)} 条(仅列出前 {cap} 条;"
                "大量成片出现通常意味着矩阵列序/解析错位,先修根因)"
            )

    visible_set = set(visible_ids)
    missing = sorted(declared_ids - visible_set)
    hidden_missing = [rid for rid in missing if rid in hidden_ids]
    plain_missing = [rid for rid in missing if rid not in hidden_ids]
    capped(
        hidden_missing,
        lambda rid: (
            f"矩阵声明的 {rid} 在正文只存在于隐藏子树（hidden/display:none），"
            "不算有效定义"
        ),
        "隐藏定义",
    )
    capped(
        plain_missing,
        lambda rid: f"矩阵声明的 {rid} 在正文没有 data-req-id 定义节点",
        "缺失定义",
    )
    capped(
        sorted(visible_set - declared_ids),
        lambda rid: f"野 REQ id: 正文存在 {rid} 但 #coverage 矩阵未声明",
        "野 REQ id ",
    )

    # per-domain counts
    actual_by_code: dict[str, int] = {}
    for rid in visible_ids:
        m = REQ_SINGLE_RE.fullmatch(rid)
        if m:
            actual_by_code[m.group(1)] = actual_by_code.get(m.group(1), 0) + 1
        else:
            problems.append(f"data-req-id 命名不符合 REQ-域码-NN 规范: {rid}")
    for code, d in decls.items():
        actual = actual_by_code.get(code, 0)
        if d["count"] is not None and actual != d["count"]:
            problems.append(
                f"域 {code} REQ 条数不符: 矩阵声明 {d['count']}，正文实际 {actual}"
            )

    # total row
    declared_sum = sum(d["count"] or 0 for d in decls.values())
    if total is None:
        # 合计行存在但解析失败时 parse_coverage_matrix 已报过具体 problem,
        # 不再叠加误导性的"缺少合计行"。
        if not saw_total_row:
            problems.append("coverage 矩阵缺少合计行")
    else:
        if total != declared_sum:
            problems.append(
                f"coverage 矩阵合计({total})与各域条数之和({declared_sum})不一致"
            )
        if total != len(visible_set):
            problems.append(
                f"coverage 矩阵合计({total})与正文实际 REQ 定义数({len(visible_set)})不一致"
            )

    # anchors: section must exist and carry the matching data-domain
    visible_domains = {
        (dom, i) for dom, i, hid in parser.domain_sections if not hid
    }
    hidden_domains = {
        (dom, i) for dom, i, hid in parser.domain_sections if hid
    }
    id_set = {i for _, i in parser.ids}
    for code, d in decls.items():
        anchor = d["anchor"]
        if anchor is None:
            continue
        if (code, anchor) in visible_domains:
            continue
        if (code, anchor) in hidden_domains:
            problems.append(
                f"矩阵锚点 #{anchor} (域 {code}) 指向的 section 被隐藏"
                "（hidden/display:none）"
            )
        elif anchor not in id_set:
            problems.append(f"矩阵锚点 #{anchor} (域 {code}) 指向的 section 不存在")
        else:
            problems.append(
                f"矩阵锚点 #{anchor} 存在但其 data-domain 与域码 {code} 不匹配"
            )

    return {
        "status": "checked",
        "declared_total": total,
        "declared_domains": {c: d["count"] for c, d in decls.items()},
        "visible_req_nodes": len(visible_ids),
        "hidden_req_nodes": len(hidden_ids),
        "problems": problems,
    }


def run_checks(doc_path: Path, fixture: dict):
    html_text = doc_path.read_text(encoding="utf-8")
    parser = DocParser()
    parser.feed(html_text)
    parser.close()

    corpus = collapse_ws(" ".join(parser.text_parts + parser.extra_text))
    domain_corpus = {
        dom: collapse_ws(" ".join(parts)) for dom, parts in parser.domain_text.items()
    }
    cases: dict[str, dict] = {}

    # ---------------- DOCQC-001 (static half): well-formedness & head sanity
    problems, warnings = [], []
    if not parser.has_doctype:
        problems.append("缺少 <!doctype html>")
    if not parser.title.strip():
        problems.append("缺少非空 <title>")
    if not parser.has_charset:
        problems.append("缺少 <meta charset>")
    if not parser.has_viewport:
        problems.append("缺少 viewport meta（响应式验收前提）")
    if len(corpus) < MIN_VISIBLE_TEXT_CHARS:
        problems.append(
            f"可见文本仅 {len(corpus)} 字符 (< {MIN_VISIBLE_TEXT_CHARS})，文档疑似为空壳"
        )
    if not parser.html_lang:
        warnings.append("<html> 缺少 lang 属性")
    cases["DOCQC-001-static"] = {
        "status": "FAIL" if problems else "PASS",
        "problems": problems,
        "warnings": warnings,
        "title": parser.title.strip(),
        "visible_text_chars": len(corpus),
    }

    # ---------------- DOCQC-002: static resource reference integrity
    problems, warnings = [], []
    css_urls = re.findall(
        r"url\(\s*['\"]?([^'\")]+?)['\"]?\s*\)", "\n".join(parser.style_texts)
    )
    all_refs = list(parser.resource_refs) + [("css", "url()", u) for u in css_urls]
    # local <a href> file links (e.g. relative links to other doc pages)
    for href, _ in parser.anchor_hrefs:
        kind = classify_url(href)
        if kind == "local":
            all_refs.append(("a", "href", href))
        elif kind in ("absolute", "protocol-relative"):
            problems.append(f"非相对路径引用不可移植: <a href>={href}")
        elif kind == "other-scheme" and href.lower().startswith("file:"):
            warnings.append(f"<a href> 使用 file: 协议，跨机器不可移植: {href}")
    checked_local = 0
    for tag, attr, url in all_refs:
        kind = classify_url(url)
        if kind == "empty":
            problems.append(f"<{tag} {attr}> 为空引用")
        elif kind == "external":
            if tag == "a":
                warnings.append(f"外部链接（导航用，可接受）: {url}")
            else:
                problems.append(
                    f"渲染依赖外部资源，破坏本地/离线可打开性: <{tag} {attr}>={url}"
                )
        elif kind in ("other-scheme", "absolute", "protocol-relative"):
            # data: is allowed (self-contained); file:/绝对路径/协议相对 都会在
            # 换机器、上 GitHub Pages 时断链
            problems.append(f"非相对路径引用不可移植: <{tag} {attr}>={url}")
        elif kind == "local":
            checked_local += 1
            ok, result = case_exact_lookup(doc_path.parent, url)
            if not ok:
                problems.append(f"<{tag} {attr}>={url} -> {result}")
            else:
                problems.extend(check_resource_file(Path(result)))
    cases["DOCQC-002"] = {
        "status": "FAIL" if problems else "PASS",
        "local_refs_checked": checked_local,
        "total_refs": len(all_refs),
        "problems": problems,
        "warnings": warnings,
    }

    # ---------------- DOCQC-004: domain coverage (section-scoped) + REQ 对账
    domain_results, problems = [], []

    req_recon = check_req_reconciliation(parser)
    problems.extend(req_recon.get("problems", []))

    for dom in fixture["domains"]:
        code = dom.get("domain_code")
        if not code:
            problems.append(
                f"fixture 域 {dom['id']} 缺少 domain_code，无法按 data-domain "
                "section 切片（请修 fixture）"
            )
            continue
        slice_text = domain_corpus.get(code, "")
        if not slice_text:
            problems.append(
                f"需求域 section 缺失: 正文没有可见的 data-domain=\"{code}\" "
                f"section（{dom['id']} / {dom['name']}）"
            )
            domain_results.append(
                {
                    "id": dom["id"],
                    "code": code,
                    "name": dom["name"],
                    "matched": 0,
                    "required": dom["min_match"],
                    "matched_patterns": [],
                    "ok": False,
                }
            )
            continue
        matched = [
            p for p in dom["patterns"] if re.search(p, slice_text, re.IGNORECASE)
        ]
        ok = len(matched) >= dom["min_match"]
        domain_results.append(
            {
                "id": dom["id"],
                "code": code,
                "name": dom["name"],
                "matched": len(matched),
                "required": dom["min_match"],
                "matched_patterns": matched,
                "ok": ok,
            }
        )
        if not ok:
            missed = [p for p in dom["patterns"] if p not in matched]
            problems.append(
                f"需求域覆盖不足: {dom['id']} ({dom['name']}) 在 data-domain="
                f"\"{code}\" 切片内命中 {len(matched)}/{dom['min_match']}，"
                f"未命中概念: {missed}"
            )
    cases["DOCQC-004"] = {
        "status": "FAIL" if problems else "PASS",
        "req_reconciliation": req_recon,
        "domains": domain_results,
        "problems": problems,
    }

    # ---------------- DOCQC-005: decided-fact fidelity (section-scoped)
    fact_results, problems = [], []
    for fact in fixture["facts"]:
        scope = fact.get("scope") or []
        if scope:
            scope_text = " ".join(domain_corpus.get(c, "") for c in scope)
        else:
            scope_text = corpus  # no scope declared -> whole doc (legacy)
        group_hits = []
        missed_groups = []
        for group in fact["groups"]:
            hit = next(
                (p for p in group if re.search(p, scope_text, re.IGNORECASE)), None
            )
            group_hits.append(hit)
            if hit is None:
                missed_groups.append(group)
        ok = not missed_groups
        fact_results.append(
            {
                "id": fact["id"],
                "name": fact["name"],
                "scope": scope,
                "ok": ok,
                "group_hits": group_hits,
            }
        )
        if not ok:
            problems.append(
                f"已定决策点缺失: {fact['id']} ({fact['name']}) "
                f"检索范围: data-domain {scope or ['<全文>']}, "
                f"未命中的 regex group: {missed_groups}"
            )
    cases["DOCQC-005"] = {
        "status": "FAIL" if problems else "PASS",
        "facts": fact_results,
        "problems": problems,
    }

    # ---------------- DOCQC-006: anchor navigation integrity
    problems, warnings = [], []
    id_set = {i for _, i in parser.ids}
    fragments = [(h, in_nav) for h, in_nav in parser.anchor_hrefs if h.startswith("#")]
    for href, _ in fragments:
        target = href[1:]
        if not target:
            problems.append('存在死链占位锚点 href="#"')
        elif target not in id_set:
            problems.append(f"锚点无目标: {href} 没有对应 id")
    dup_ids = {i for _, i in parser.ids if [x for _, x in parser.ids].count(i) > 1}
    for d in sorted(dup_ids):
        problems.append(f"重复 id: {d}（锚点跳转行为不确定）")
    nav_internal = [h for h, in_nav in fragments if in_nav]
    if parser.nav_count == 0:
        problems.append('缺少页面导航（<nav> 或 role="navigation" 等价）')
    elif len(set(nav_internal)) < 5:
        problems.append(
            f"nav 内部锚点过少（{len(set(nav_internal))} < 5），页面导航不完整"
        )
    linked_targets = {h[1:] for h, _ in fragments if len(h) > 1}
    for tag, i in parser.ids:
        if tag == "section" and i not in linked_targets:
            warnings.append(f"section#{i} 没有任何入站锚点（可能是导航遗漏）")
    cases["DOCQC-006"] = {
        "status": "FAIL" if problems else "PASS",
        "ids": len(id_set),
        "internal_anchors": len(fragments),
        "nav_internal_anchors": len(set(nav_internal)),
        "problems": problems,
        "warnings": warnings,
    }

    return cases


def write_report(report_path: Path, payload: dict) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--doc", default=str(REPO_ROOT / "docs" / "index.html"))
    ap.add_argument(
        "--fixture",
        default=str(REPO_ROOT / "tests" / "fixtures" / "docqc_requirement_domains.json"),
    )
    ap.add_argument(
        "--report",
        default=str(REPO_ROOT / "tests" / "reports" / "docqc_static_report.json"),
    )
    args = ap.parse_args()

    doc_path = Path(args.doc).resolve()
    fixture_path = Path(args.fixture).resolve()
    report_path = Path(args.report).resolve()

    def infra_error(msg: str) -> int:
        # Infrastructure problem (bad plumbing, not a bad document):
        # exit 2 + report with "error" so a harness never confuses this
        # with a legitimate documentation FAIL (exit 1).
        write_report(
            report_path,
            {
                "suite": "docqc_static",
                "doc": str(doc_path),
                "fixture": str(fixture_path),
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "error": msg,
                "cases": {},
            },
        )
        print(f"ERROR (infra) {msg}")
        print(f"report: {report_path}")
        return 2

    if not doc_path.is_file():
        return infra_error(f"被测文档不存在: {doc_path}")
    if not fixture_path.is_file():
        return infra_error(f"fixture 不存在: {fixture_path}")

    try:
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return infra_error(f"fixture 无法解析为 JSON: {fixture_path} ({e})")
    if not isinstance(fixture, dict) or "domains" not in fixture or "facts" not in fixture:
        return infra_error(f"fixture 缺少 domains/facts 键: {fixture_path}")

    try:
        cases = run_checks(doc_path, fixture)
    except UnicodeDecodeError as e:
        return infra_error(f"被测文档不是合法 UTF-8: {doc_path} ({e})")

    report = {
        "suite": "docqc_static",
        "doc": str(doc_path),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "cases": cases,
    }
    write_report(report_path, report)

    failed = False
    for cid, c in cases.items():
        print(f"{c['status']} {cid}")
        for p in c.get("problems", []):
            print(f"    problem: {p}")
        for w in c.get("warnings", []):
            print(f"    warning: {w}")
        failed = failed or c["status"] == "FAIL"
    print(f"report: {report_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
