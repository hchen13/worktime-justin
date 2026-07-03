#!/usr/bin/env python3
"""Idempotently configure the WorkTime Justin Feishu Bitable board fields."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path


BASE_URL = "https://open.feishu.cn/open-apis"
WIKI_TOKEN = "QsKfwHvaDihj4QkTPMzclmQpnob"
TABLE_ID = "tblZfqKOydgqr7XS"

FIELD_TEXT = 1
FIELD_SINGLE_SELECT = 3
FIELD_DATE = 5

STATUS_VIEW_NAME = "按状态看板"
STATUS_VIEW_TYPE = "kanban"
CARD_ID_PREFIX = "WTJ"


STATUSES = [
    "backlog",
    "todo",
    "in progress",
    "review",
    "testing",
    "blocking",
    "done",
    "_deprecated",
]

ROLES = ["PM", "TL", "DESIGN", "QA", "Ethan"]


SELECT_FIELDS = {
    "状态": STATUSES,
    "负责人": ROLES,
    "卡片类型": ["Requirement", "Task", "Design", "Dev", "QA", "Blocker", "Decision", "Chore"],
    "优先级": ["P0", "P1", "P2", "P3"],
    "模块": [
        "Product",
        "UX",
        "Canvas",
        "Keyboard",
        "Secret Words",
        "Task Mode",
        "Rewards",
        "Assets",
        "Audio/TTS",
        "Packaging",
        "Feishu/Process",
        "Infra",
    ],
    "评审负责人": ROLES,
    "QA结果": ["N/A", "Not Started", "Planned", "Running", "Pass", "Fail"],
    "测试方式": ["N/A", "Scripted", "Agentic", "Hybrid"],
    "测试类型": ["N/A", "Unit", "Frontend E2E", "Visual", "API E2E", "Integration"],
    "阻塞负责人": ROLES,
}

TEXT_FIELDS = [
    "编号",
    "概要",
    "验收标准",
    "下一步动作",
    "阻塞问题",
    "依赖",
    "分支",
    "产物/证据",
    "测试资产路径",
    "测试覆盖范围",
    "对抗评审",
    "最新进展",
]

DATE_FIELDS = ["截止/检查点"]

FIELD_ALIASES = {
    "标题": ["Title", "文本"],
    "编号": ["Serial", "Card ID", "ID"],
    "状态": ["Status"],
    "负责人": ["Owner"],
    "卡片类型": ["Card Type"],
    "优先级": ["Priority"],
    "模块": ["Component"],
    "概要": ["Summary"],
    "验收标准": ["Acceptance Criteria"],
    "下一步动作": ["Next Action"],
    "评审负责人": ["Review Owner"],
    "QA结果": ["QA Result"],
    "测试方式": ["Test Method"],
    "测试类型": ["Test Type"],
    "测试资产路径": ["Test Asset Path"],
    "测试覆盖范围": ["Test Coverage"],
    "对抗评审": ["Adversarial Review"],
    "阻塞负责人": ["Blocker Owner"],
    "阻塞问题": ["Blocking Question"],
    "依赖": ["Depends On"],
    "分支": ["Branch"],
    "产物/证据": ["Artifact/Evidence"],
    "最新进展": ["Last Update"],
    "截止/检查点": ["Due / Checkpoint"],
}


def load_env(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"Missing {path}")
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


def request(method: str, path: str, token: str | None = None, payload: dict | None = None) -> dict:
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed: HTTP {exc.code}: {detail}") from exc
    if body.get("code") == 1254606 and body.get("msg") == "DataNotChange":
        return body
    if body.get("code") != 0:
        raise RuntimeError(f"{method} {path} failed: {body.get('code')} {body.get('msg')}")
    return body


def tenant_token() -> str:
    payload = {"app_id": os.environ["PM_APP_ID"], "app_secret": os.environ["PM_APP_SECRET"]}
    return request("POST", "/auth/v3/tenant_access_token/internal", payload=payload)["tenant_access_token"]


def resolve_app_token(token: str) -> str:
    query = urllib.parse.urlencode({"token": WIKI_TOKEN})
    body = request("GET", f"/wiki/v2/spaces/get_node?{query}", token=token)
    node = body["data"]["node"]
    if node.get("obj_type") != "bitable":
        raise RuntimeError(f"Wiki node is not a bitable: {node.get('obj_type')}")
    return node["obj_token"]


def list_fields(token: str, app_token: str) -> list[dict]:
    fields: list[dict] = []
    page_token = ""
    while True:
        params = {"page_size": 100}
        if page_token:
            params["page_token"] = page_token
        query = urllib.parse.urlencode(params)
        body = request("GET", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/fields?{query}", token=token)
        data = body.get("data", {})
        fields.extend(data.get("items") or [])
        if not data.get("has_more"):
            break
        page_token = data["page_token"]
    return fields


def list_views(token: str, app_token: str) -> list[dict]:
    views: list[dict] = []
    page_token = ""
    while True:
        params = {"page_size": 100}
        if page_token:
            params["page_token"] = page_token
        query = urllib.parse.urlencode(params)
        body = request("GET", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/views?{query}", token=token)
        data = body.get("data", {})
        views.extend(data.get("items") or [])
        if not data.get("has_more"):
            break
        page_token = data["page_token"]
    return views


def list_records(token: str, app_token: str) -> list[dict]:
    records: list[dict] = []
    page_token = ""
    while True:
        params = {"page_size": 500}
        if page_token:
            params["page_token"] = page_token
        query = urllib.parse.urlencode(params)
        body = request("GET", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/records?{query}", token=token)
        data = body.get("data", {})
        records.extend(data.get("items") or [])
        if not data.get("has_more"):
            break
        page_token = data["page_token"]
    return records


def update_field(token: str, app_token: str, field_id: str, payload: dict) -> None:
    request("PUT", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/fields/{field_id}", token=token, payload=payload)


def create_field(token: str, app_token: str, payload: dict) -> None:
    request("POST", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/fields", token=token, payload=payload)


def create_view(token: str, app_token: str, payload: dict) -> None:
    request("POST", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/views", token=token, payload=payload)


def update_view(token: str, app_token: str, view_id: str, payload: dict) -> None:
    request("PATCH", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/views/{view_id}", token=token, payload=payload)


def delete_records(token: str, app_token: str, record_ids: list[str]) -> None:
    for start in range(0, len(record_ids), 500):
        chunk = record_ids[start : start + 500]
        request(
            "POST",
            f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/records/batch_delete",
            token=token,
            payload={"records": chunk},
        )


def select_property(options: list[str]) -> dict:
    return {"options": [{"name": name} for name in options]}


def option_names(field: dict) -> list[str]:
    return [option.get("name") for option in (field.get("property") or {}).get("options", [])]


def find_field(by_name: dict[str, dict], canonical_name: str) -> dict | None:
    if canonical_name in by_name:
        return by_name[canonical_name]
    for alias in FIELD_ALIASES.get(canonical_name, []):
        if alias in by_name:
            return by_name[alias]
    return None


def ensure_fields(token: str, app_token: str) -> None:
    fields = list_fields(token, app_token)
    by_name = {field["field_name"]: field for field in fields}
    primary = next((field for field in fields if field.get("is_primary")), None)

    if primary and primary["field_name"] != "标题":
        update_field(token, app_token, primary["field_id"], {"field_name": "标题", "type": FIELD_TEXT})
        by_name.pop(primary["field_name"], None)
        by_name["标题"] = {**primary, "field_name": "标题"}
        print(f"renamed primary field {primary['field_name']} -> 标题")

    for name, options in SELECT_FIELDS.items():
        payload = {"field_name": name, "type": FIELD_SINGLE_SELECT, "property": select_property(options)}
        existing = find_field(by_name, name)
        if existing:
            needs_update = (
                existing.get("field_name") != name
                or existing.get("type") != FIELD_SINGLE_SELECT
                or option_names(existing) != options
            )
            if needs_update:
                update_field(token, app_token, existing["field_id"], payload)
                print(f"updated select field {name}")
            else:
                print(f"select field already current {name}")
        else:
            create_field(token, app_token, payload)
            print(f"created select field {name}")

    for name in TEXT_FIELDS:
        payload = {"field_name": name, "type": FIELD_TEXT}
        existing = find_field(by_name, name)
        if existing:
            if existing["field_name"] != name:
                update_field(token, app_token, existing["field_id"], payload)
                print(f"renamed text field {existing['field_name']} -> {name}")
        else:
            create_field(token, app_token, payload)
            print(f"created text field {name}")

    for name in DATE_FIELDS:
        payload = {
            "field_name": name,
            "type": FIELD_DATE,
            "property": {"date_formatter": "yyyy-MM-dd"},
        }
        existing = find_field(by_name, name)
        if existing:
            update_field(token, app_token, existing["field_id"], payload)
            print(f"updated date field {name}")
        else:
            create_field(token, app_token, payload)
            print(f"created date field {name}")


def ensure_views(token: str, app_token: str) -> None:
    views = list_views(token, app_token)
    view = next((item for item in views if item.get("view_name") == STATUS_VIEW_NAME), None)
    if view:
        print(f"view already exists: {STATUS_VIEW_NAME}")
    else:
        create_view(token, app_token, {"view_name": STATUS_VIEW_NAME, "view_type": STATUS_VIEW_TYPE})
        view = next((item for item in list_views(token, app_token) if item.get("view_name") == STATUS_VIEW_NAME), None)
        print(f"created view {STATUS_VIEW_NAME}")

    fields = list_fields(token, app_token)
    status_field = next((field for field in fields if field.get("field_name") == "状态"), None)
    if view and status_field:
        update_view(
            token,
            app_token,
            view["view_id"],
            {"property": {"group_config": [{"field_id": status_field["field_id"]}]}},
        )
        # Feishu currently rejects hidden_fields on kanban/gallery views.
        print(f"grouped {STATUS_VIEW_NAME} by 状态")


def is_blank_value(value: object) -> bool:
    return value is None or value == "" or value == [] or value == {}


def cleanup_blank_records(token: str, app_token: str) -> None:
    records = list_records(token, app_token)
    blank_record_ids = [
        record["record_id"]
        for record in records
        if all(is_blank_value(value) for value in record.get("fields", {}).values())
    ]
    if not blank_record_ids:
        print("no blank records found")
        return
    delete_records(token, app_token, blank_record_ids)
    print(f"deleted {len(blank_record_ids)} blank record(s)")


def update_record(token: str, app_token: str, record_id: str, fields: dict) -> None:
    request(
        "PUT",
        f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/records/{record_id}",
        token=token,
        payload={"fields": fields},
    )


def next_card_id(existing_ids: list[str], date_part: str, offset: int) -> str:
    prefix = f"{CARD_ID_PREFIX}-{date_part}-"
    existing_numbers: list[int] = []
    for value in existing_ids:
        if not isinstance(value, str) or not value.startswith(prefix):
            continue
        suffix = value.removeprefix(prefix)
        if suffix.isdigit():
            existing_numbers.append(int(suffix))
    return f"{prefix}{(max(existing_numbers, default=0) + offset):03d}"


def ensure_record_numbers(token: str, app_token: str) -> None:
    records = list_records(token, app_token)
    existing_ids = [
        record.get("fields", {}).get("编号")
        for record in records
        if record.get("fields", {}).get("编号")
    ]
    missing = [
        record
        for record in records
        if not is_blank_value(record.get("fields", {}).get("标题"))
        and is_blank_value(record.get("fields", {}).get("编号"))
    ]
    if not missing:
        print("all nonblank records have 编号")
        return

    date_part = datetime.now().strftime("%Y%m%d")
    missing.sort(key=lambda record: (record.get("created_time") or 0, record["record_id"]))
    for index, record in enumerate(missing, start=1):
        card_id = next_card_id(existing_ids, date_part, index)
        update_record(token, app_token, record["record_id"], {"编号": card_id})
        print(f"assigned 编号 {card_id} to {record['record_id']}")
    print(f"assigned 编号 to {len(missing)} record(s)")


def main() -> int:
    load_env(Path(".env"))
    token = tenant_token()
    app_token = resolve_app_token(token)
    ensure_fields(token, app_token)
    ensure_views(token, app_token)
    cleanup_blank_records(token, app_token)
    ensure_record_numbers(token, app_token)
    print("Feishu board fields are configured.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
