#!/usr/bin/env python3
"""Check whether Feishu cards cover all requirement IDs in docs/index.html."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DOC_PATH = ROOT / "docs" / "index.html"
SETUP_PATH = ROOT / ".agents" / "tools" / "setup_feishu_board.py"
ENV_PATH = ROOT / ".env"

COVERAGE_FIELDS = [
    "编号",
    "标题",
    "概要",
    "验收标准",
    "测试覆盖范围",
    "最新进展",
]

TERMINAL_EXCLUDED_STATUSES = {"_deprecated"}

REQ_ID_RE = re.compile(r"REQ-([A-Z]+)-(\d{2})")
REQ_DATA_RE = re.compile(r'data-req-id="(REQ-[A-Z]+-\d{2})"')
REQ_RANGE_RE = re.compile(
    r"REQ-([A-Z]+)-(\d{2})\s*(?:\.\.|~|至|到|–|—|-)\s*(?:REQ-\1-)?(\d{2})"
)


def load_board_helper() -> Any:
    spec = importlib.util.spec_from_file_location("setup_feishu_board", SETUP_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {SETUP_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def text_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return " ".join(text_value(item) for item in value)
    if isinstance(value, dict):
        parts: list[str] = []
        for key in ("text", "name", "value", "link", "record_ids"):
            if key in value:
                parts.append(text_value(value[key]))
        if not parts:
            parts.extend(text_value(item) for item in value.values())
        return " ".join(part for part in parts if part)
    return str(value)


def extract_doc_reqs() -> set[str]:
    html = DOC_PATH.read_text(encoding="utf-8")
    return set(REQ_DATA_RE.findall(html))


def expand_ranges(text: str, known: set[str]) -> set[str]:
    result: set[str] = set()
    for match in REQ_RANGE_RE.finditer(text):
        domain, start_s, end_s = match.groups()
        start = int(start_s)
        end = int(end_s)
        if start > end:
            start, end = end, start
        for index in range(start, end + 1):
            req_id = f"REQ-{domain}-{index:02d}"
            if req_id in known:
                result.add(req_id)
    return result


def extract_reqs_from_text(text: str, known: set[str]) -> set[str]:
    found = {match.group(0) for match in REQ_ID_RE.finditer(text)}
    return {req for req in found if req in known} | expand_ranges(text, known)


def record_status(fields: dict[str, Any]) -> str:
    status = text_value(fields.get("状态")).strip()
    return status or "<blank>"


def record_card_id(fields: dict[str, Any], record_id: str) -> str:
    return text_value(fields.get("编号")).strip() or record_id


def collect_board_coverage(known_reqs: set[str]) -> tuple[dict[str, set[str]], dict[str, Any]]:
    helper = load_board_helper()
    helper.load_env(ENV_PATH)
    token = helper.tenant_token()
    app_token = helper.resolve_app_token(token)
    records = helper.list_records(token, app_token)

    covered_by: dict[str, set[str]] = defaultdict(set)
    active_cards: list[str] = []
    deprecated_cards: list[str] = []
    unknown_status_cards: list[str] = []

    for record in records:
        fields = record.get("fields") or {}
        card_id = record_card_id(fields, record.get("record_id", "<unknown>"))
        if not card_id.startswith("WTJ-"):
            continue
        status = record_status(fields)
        if status in TERMINAL_EXCLUDED_STATUSES:
            deprecated_cards.append(card_id)
            continue
        if status == "<blank>":
            unknown_status_cards.append(card_id)
        active_cards.append(card_id)
        haystack = "\n".join(text_value(fields.get(field)) for field in COVERAGE_FIELDS)
        for req_id in extract_reqs_from_text(haystack, known_reqs):
            covered_by[req_id].add(card_id)

    meta = {
        "app_token": app_token,
        "record_count": len(records),
        "active_official_cards": sorted(active_cards),
        "deprecated_official_cards": sorted(deprecated_cards),
        "unknown_status_cards": sorted(unknown_status_cards),
    }
    return covered_by, meta


def summarize_by_domain(reqs: set[str]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for req_id in reqs:
        domain = req_id.split("-")[1]
        counts[domain] += 1
    return dict(sorted(counts.items()))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument("--fail-on-missing", action="store_true", help="Exit 2 when any requirement is uncovered.")
    args = parser.parse_args()

    known_reqs = extract_doc_reqs()
    covered_by, meta = collect_board_coverage(known_reqs)
    covered = set(covered_by)
    missing = known_reqs - covered
    unknown_refs = covered - known_reqs

    payload = {
        "ok": not missing,
        "doc_path": str(DOC_PATH),
        "total_requirements": len(known_reqs),
        "covered_count": len(covered),
        "missing_count": len(missing),
        "missing": sorted(missing),
        "missing_by_domain": summarize_by_domain(missing),
        "covered_by": {req: sorted(cards) for req, cards in sorted(covered_by.items())},
        "unknown_refs": sorted(unknown_refs),
        "board": meta,
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print(f"Requirements: {len(known_reqs)} total, {len(covered)} covered, {len(missing)} missing")
        if missing:
            print("Missing by domain:")
            for domain, count in payload["missing_by_domain"].items():
                print(f"- {domain}: {count}")
            print("Missing IDs:")
            print(", ".join(payload["missing"]))
        else:
            print("All requirement IDs are mapped to at least one active official card.")
        if meta["unknown_status_cards"]:
            print("Cards with blank status:")
            print(", ".join(meta["unknown_status_cards"]))

    if missing and args.fail_on_missing:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
