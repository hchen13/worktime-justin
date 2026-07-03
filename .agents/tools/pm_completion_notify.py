#!/usr/bin/env python3
"""Send a one-time PM Feishu DM when every official board card is terminal."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ACTIVE_STATUSES = {"backlog", "todo", "in progress", "review", "testing", "blocking"}
TERMINAL_STATUSES = {"done", "_deprecated"}
STATE_PATH = Path(".agents/state/pm-completion-notify.json")


def load_board_module():
    module_path = Path(__file__).with_name("setup_feishu_board.py")
    spec = importlib.util.spec_from_file_location("setup_feishu_board", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def is_nonblank_record(fields: dict[str, Any]) -> bool:
    return bool(fields.get("编号") or fields.get("标题"))


def board_snapshot(records: list[dict[str, Any]]) -> dict[str, Any]:
    cards: list[dict[str, str]] = []
    for record in records:
        fields = record.get("fields", {})
        if not is_nonblank_record(fields):
            continue
        cards.append(
            {
                "编号": str(fields.get("编号") or record.get("record_id") or ""),
                "标题": str(fields.get("标题") or ""),
                "状态": str(fields.get("状态") or ""),
                "负责人": str(fields.get("负责人") or ""),
            }
        )
    cards.sort(key=lambda item: (item["编号"], item["标题"]))
    active = [card for card in cards if card["状态"] in ACTIVE_STATUSES or card["状态"] not in TERMINAL_STATUSES]
    terminal = [card for card in cards if card["状态"] in TERMINAL_STATUSES]
    counts: dict[str, int] = {}
    for card in cards:
        counts[card["状态"] or "(empty)"] = counts.get(card["状态"] or "(empty)", 0) + 1
    payload = json.dumps(cards, ensure_ascii=False, sort_keys=True)
    fingerprint = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    return {
        "cards": cards,
        "active": active,
        "terminal": terminal,
        "counts": counts,
        "fingerprint": fingerprint,
        "all_done": bool(cards) and not active,
    }


def read_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text())
    except json.JSONDecodeError:
        return {}


def write_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def send_text(fb: Any, token: str, open_id: str, message: str) -> dict[str, Any]:
    query = urllib.parse.urlencode({"receive_id_type": "open_id"})
    payload = {
        "receive_id": open_id,
        "msg_type": "text",
        "content": json.dumps({"text": message}, ensure_ascii=False),
    }
    return fb.request("POST", f"/im/v1/messages?{query}", token=token, payload=payload)


def completion_message(snapshot: dict[str, Any]) -> str:
    counts = ", ".join(f"{status}: {count}" for status, count in sorted(snapshot["counts"].items()))
    return (
        "WorkTime Justin 看板已全部完成。\n"
        "当前没有 backlog / todo / in progress / review / testing / blocking 卡片，"
        "所有正式卡片均为 done 或 _deprecated。\n"
        f"状态统计：{counts}\n"
        f"PM loop 检查时间：{now_iso()}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Check completion state without sending Feishu.")
    args = parser.parse_args()

    fb = load_board_module()
    fb.load_env(Path(".env"))
    token = fb.tenant_token()
    app_token = fb.resolve_app_token(token)
    records = fb.list_records(token, app_token)
    snapshot = board_snapshot(records)
    state = read_state()

    if not snapshot["all_done"]:
        write_state(
            {
                "completion_open": False,
                "last_checked_at": now_iso(),
                "last_active_count": len(snapshot["active"]),
                "last_counts": snapshot["counts"],
            }
        )
        print(
            json.dumps(
                {
                    "all_done": False,
                    "sent": False,
                    "active_count": len(snapshot["active"]),
                    "counts": snapshot["counts"],
                },
                ensure_ascii=False,
            )
        )
        return 0

    if state.get("completion_open") and state.get("fingerprint") == snapshot["fingerprint"]:
        print(
            json.dumps(
                {
                    "all_done": True,
                    "sent": False,
                    "reason": "already_notified",
                    "counts": snapshot["counts"],
                },
                ensure_ascii=False,
            )
        )
        return 0

    open_id = os.environ.get("ETHAN_FEISHU_OPEN_ID", "").strip()
    if not open_id:
        raise SystemExit("Missing ETHAN_FEISHU_OPEN_ID in .env")

    message = completion_message(snapshot)
    if args.dry_run:
        print(json.dumps({"all_done": True, "sent": False, "dry_run": True, "message": message}, ensure_ascii=False))
        return 0

    body = send_text(fb, token, open_id, message)
    write_state(
        {
            "completion_open": True,
            "fingerprint": snapshot["fingerprint"],
            "last_sent_at": now_iso(),
            "last_message_id": ((body.get("data") or {}).get("message_id")),
            "last_counts": snapshot["counts"],
        }
    )
    print(json.dumps({"all_done": True, "sent": True, "counts": snapshot["counts"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
