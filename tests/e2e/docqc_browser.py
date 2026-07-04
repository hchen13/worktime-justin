#!/usr/bin/env python3
"""DOCQC browser checks for the requirements doc (QA card WTJ-20260703-003).

Cases implemented (definitions in tests/e2e/docqc-cases.md):
  DOCQC-001 (open half)  file:// 本地可打开：加载成功、标题非空、正文非空、无 JS 异常
  DOCQC-003              运行时资源健康：离线上下文中所有子资源加载成功、无外网请求、
                         所有 file:// 子资源位于被测文档目录之下（禁止绝对路径/../ 逃逸）、
                         <img> 数量 >= fixture expectations.min_images（默认 1）
                         且全部实际解码出像素（naturalWidth > 0）
  DOCQC-007              响应式：在 320/375/768/1024/1280/1440 宽度下页面无水平滚动，
                         越界元素仅允许出现在 computed overflow-x 为 auto/scroll 的
                         真滚动容器内；被 overflow-x:hidden/clip 祖先裁剪的越界内容
                         视为不可达，报 FAIL。完全位于视口左/上侧之外的无障碍元素
                         （skip-link 惯例）不告警。

Design notes:
  * Runs the page in an offline browser context: file:// 资源仍可加载，
    任何对 http(s) 的依赖都会自然失败并被记录 —— 这就是"本地可打开"的
    最严格定义（无网也能看）。
  * Overflow 检查基于 scrollWidth / boundingClientRect，与具体 DOM 结构
    和 class 名无关，对 TL 重构鲁棒。
  * 需要 playwright（本机已装）。无其他依赖。

Usage:
  python3 tests/e2e/docqc_browser.py [--doc docs/index.html] \
      [--report tests/reports/docqc_browser_report.json]

Exit code 0 = all cases PASS, 1 = at least one FAIL.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]

VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1280, 1440]
MIN_BODY_TEXT_CHARS = 800

OVERFLOW_JS = """
() => {
  const vw = document.documentElement.clientWidth;
  const doc = document.scrollingElement || document.documentElement;
  const out = {
    viewport: vw,
    scrollWidth: doc.scrollWidth,
    pageOverflow: doc.scrollWidth > vw + 1,
    offenders: [],
    clipped: []
  };
  // 越界元素按祖先链分类：
  //   'scrollable' —— 最近的相关祖先 computed overflow-x 为 auto/scroll，
  //                   读者可横向滚动到达 —— 唯一合法的豁免。
  //   'clipped'    —— 元素越出了某个 overflow-x:hidden/clip 祖先的盒边界，
  //                   内容被裁掉且无法滚动到达（FP-02：以前被误当合法容器豁免）。
  //   'free'       —— 没有滚动/裁剪祖先约束，直接顶着视口。
  const classify = (el, r) => {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return 'scrollable';
      if (ox === 'hidden' || ox === 'clip') {
        const nr = n.getBoundingClientRect();
        if (r.right > nr.right + 1 || r.left < nr.left - 1) return 'clipped';
        // 元素没超出这个裁剪盒；越界来自祖先自身位置，继续向上判断。
      }
    }
    return 'free';
  };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (!(r.right > vw + 1 || r.left < -1)) continue;
    // ADV-ENG-005：skip-link 等无障碍惯例 —— 完全位于视口左侧/上方之外的
    // 元素在 LTR 下不增加 scrollWidth（向右不可滚出），不是被切内容，不告警。
    if (r.right <= 0 || r.bottom <= 0) continue;
    const kind = classify(el, r);
    if (kind === 'scrollable') continue;
    const info = {
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 80),
      left: Math.round(r.left),
      right: Math.round(r.right)
    };
    if (kind === 'clipped') {
      // aria-hidden 装饰性子树（mock 画布里的漂浮字母等）被容器裁剪属设计行为，
      // 不构成"读者内容不可达"。
      if (!el.closest('[aria-hidden="true"]')) out.clipped.push(info);
    } else {
      out.offenders.push(info);
    }
    if (out.offenders.length + out.clipped.length >= 40) break;
  }
  return out;
}
"""

IMG_HEALTH_JS = """
() => Array.from(document.images).map(i => ({
  src: i.getAttribute('src'),
  complete: i.complete,
  naturalWidth: i.naturalWidth
}))
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--doc", default=str(REPO_ROOT / "docs" / "index.html"))
    ap.add_argument(
        "--report",
        default=str(REPO_ROOT / "tests" / "reports" / "docqc_browser_report.json"),
    )
    ap.add_argument(
        "--fixture",
        default=str(REPO_ROOT / "tests" / "fixtures" / "docqc_requirement_domains.json"),
        help="同 docqc_static.py；可选键 expectations.min_images 控制 DOCQC-003 图片数下限（默认 1）",
    )
    args = ap.parse_args()

    doc_path = Path(args.doc).resolve()

    def infra_error(msg: str) -> int:
        # 与 docqc_static.py 对齐的退出码契约: 2 = 基础设施错误(非文档质量问题),
        # 报告含 error 字段且 cases 为空, harness 不得当作文档 FAIL 处理。
        report_path = Path(args.report).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(
                {"doc": str(doc_path), "error": msg, "cases": {}},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"INFRA-ERROR {msg}")
        print(f"report: {report_path}")
        return 2

    if not doc_path.is_file():
        return infra_error(f"被测文档不存在: {doc_path}")

    # FALSERED-05：图片数下限可配置。文档合法演进（如改用内联 SVG）时，
    # fixture 所有者在 expectations.min_images 里声明，脚本不硬编码。
    # fixture 缺失时按可选处理走默认值；存在但不可解析属基础设施错误(exit 2)。
    min_images = 1
    fixture_path = Path(args.fixture)
    if fixture_path.is_file():
        try:
            fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
            min_images = int(fixture.get("expectations", {}).get("min_images", 1))
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            return infra_error(f"fixture 存在但不可解析: {fixture_path} ({e})")
    cases: dict[str, dict] = {}
    url = doc_path.as_uri()

    external_requests: list[str] = []
    file_requests: list[str] = []
    failed_requests: list[str] = []
    page_errors: list[str] = []
    console_errors: list[str] = []

    def track_request(r) -> None:
        if r.url.startswith(("http://", "https://")):
            external_requests.append(r.url)
        elif r.url.startswith("file://"):
            file_requests.append(r.url)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        # offline=True: 断网。file:// 不受影响，任何外网依赖都会暴露。
        context = browser.new_context(offline=True, viewport={"width": 1280, "height": 900})
        page = context.new_page()
        page.on("request", track_request)
        page.on(
            "requestfailed",
            lambda r: failed_requests.append(f"{r.url} ({r.failure})"),
        )
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )

        page.goto(url, wait_until="load")
        page.wait_for_timeout(400)
        # 冻结动画，保证测量与截图确定性（不影响布局盒尺寸）。
        page.add_style_tag(
            content="*,*::before,*::after{animation:none !important;transition:none !important;}"
        )

        # -------- DOCQC-001 (open half)
        title = page.title().strip()
        body_text_len = page.evaluate("() => document.body.innerText.trim().length")
        problems = []
        if not title:
            problems.append("加载后 <title> 为空")
        if body_text_len < MIN_BODY_TEXT_CHARS:
            problems.append(
                f"正文可见文本仅 {body_text_len} 字符 (< {MIN_BODY_TEXT_CHARS})"
            )
        if page_errors:
            problems.append(f"页面 JS 异常: {page_errors}")
        cases["DOCQC-001-open"] = {
            "status": "FAIL" if problems else "PASS",
            "title": title,
            "body_text_chars": body_text_len,
            "problems": problems,
        }

        # -------- DOCQC-003 runtime resource health
        images = page.evaluate(IMG_HEALTH_JS)
        broken_imgs = [
            i["src"] for i in images if not (i["complete"] and i["naturalWidth"] > 0)
        ]
        # FP-03：file:// 子资源必须位于被测文档所在目录之下。绝对路径指向
        # 目录外 / ../ 逃出的资源在本机双绿放行，但文档一旦移动/分发即坏。
        doc_dir = doc_path.parent
        escaped_file_urls: list[str] = []
        for u in sorted(set(file_requests)):
            try:
                p = Path(unquote(urlsplit(u).path)).resolve()
            except (ValueError, OSError):
                escaped_file_urls.append(u)
                continue
            if p == doc_path:
                continue  # 主文档自身的导航请求
            if not p.is_relative_to(doc_dir):
                escaped_file_urls.append(u)

        problems = []
        if external_requests:
            problems.append(
                f"页面发起了 {len(external_requests)} 个外网请求（破坏离线可打开性）: "
                + ", ".join(sorted(set(external_requests))[:5])
            )
        if escaped_file_urls:
            problems.append(
                f"子资源越出被测文档目录 {doc_dir}（file:// 绝对路径/../ 逃逸，"
                f"本机能加载但不可移植）: {escaped_file_urls[:5]}"
            )
        if failed_requests:
            problems.append(f"子资源加载失败: {failed_requests[:10]}")
        if broken_imgs:
            problems.append(f"图片未解码出像素（坏图/路径错误）: {broken_imgs}")
        if len(images) < min_images:
            problems.append(
                f"页面 <img> 数量 {len(images)} < 下限 {min_images}"
                "（fixture expectations.min_images，默认 1；改用内联 SVG 等演进请在 fixture 声明）"
            )
        if console_errors:
            problems.append(f"console error: {console_errors[:10]}")
        cases["DOCQC-003"] = {
            "status": "FAIL" if problems else "PASS",
            "images_total": len(images),
            "min_images": min_images,
            "external_requests": sorted(set(external_requests)),
            "escaped_file_urls": escaped_file_urls,
            "problems": problems,
        }

        # -------- DOCQC-007 responsive horizontal overflow
        width_results = []
        problems = []
        for w in VIEWPORT_WIDTHS:
            page.set_viewport_size({"width": w, "height": 900})
            page.wait_for_timeout(200)
            res = page.evaluate(OVERFLOW_JS)
            res["width"] = w
            width_results.append(res)
            if res["pageOverflow"]:
                problems.append(
                    f"{w}px: 页面水平溢出 scrollWidth={res['scrollWidth']} > viewport={res['viewport']}; "
                    f"越界元素: {res['offenders'][:5]}"
                )
            if res.get("clipped"):
                # FP-02：overflow-x:hidden/clip 不是滚动容器 —— 被它裁掉的
                # 越界内容读者无法滚动到达，即使页面整体不溢出也算失败。
                problems.append(
                    f"{w}px: 内容被 overflow-x:hidden/clip 祖先裁剪、无法滚动到达: "
                    f"{res['clipped'][:5]}"
                )
        warnings = []
        for res in width_results:
            if not res["pageOverflow"] and res["offenders"]:
                warnings.append(
                    f"{res['width']}px: 有元素超出视口但被裁剪（不滚动，疑似内容被切）: "
                    f"{res['offenders'][:5]}"
                )
        cases["DOCQC-007"] = {
            "status": "FAIL" if problems else "PASS",
            "widths": width_results,
            "problems": problems,
            "warnings": warnings,
        }

        context.close()
        browser.close()

    report = {
        "suite": "docqc_browser",
        "doc": str(doc_path),
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "cases": cases,
    }
    report_path = Path(args.report).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

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
