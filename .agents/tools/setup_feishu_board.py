#!/usr/bin/env python3
"""Idempotently configure the WorkTime Justin Feishu Bitable board fields."""

from __future__ import annotations

import json
import os
import sys
import time
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

BOARD_VIEW_NAME = "看板"
LEGACY_BOARD_VIEW_NAMES = ["按状态看板"]
BOARD_VIEW_TYPE = "kanban"
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
ROLE_BOARD_VIEWS = {
    "PM": "PM 看板",
    "TL": "TL 看板",
    "DESIGN": "DESIGN 看板",
    "QA": "QA 看板",
}
BOARD_VISIBLE_FIELDS = [
    "标题",
    "负责人",
    "优先级",
    "评审负责人",
    "概要",
    "下一步动作",
    "阻塞问题",
    "依赖",
    "分支",
    "编号",
]


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

SELECT_FIELD_OPTION_COLORS = {
    "状态": {
        "backlog": {"hue": "Wathet", "lightness": "Lighter"},
        "todo": {"hue": "Blue", "lightness": "Lighter"},
        "in progress": {"hue": "Orange", "lightness": "Lighter"},
        "review": {"hue": "Purple", "lightness": "Lighter"},
        "testing": {"hue": "Turquoise", "lightness": "Lighter"},
        "blocking": {"hue": "Red", "lightness": "Light"},
        "done": {"hue": "Green", "lightness": "Light"},
        "_deprecated": {"hue": "Gray", "lightness": "Light"},
    },
    "优先级": {
        "P0": {"hue": "Red", "lightness": "Light"},
        "P1": {"hue": "Orange", "lightness": "Light"},
        "P2": {"hue": "Yellow", "lightness": "Light"},
        "P3": {"hue": "Green", "lightness": "Light"},
    },
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


def update_field_v3(token: str, app_token: str, field_id: str, payload: dict) -> dict:
    return request("PUT", f"/base/v3/bases/{app_token}/tables/{TABLE_ID}/fields/{field_id}", token=token, payload=payload)


def create_field(token: str, app_token: str, payload: dict) -> None:
    request("POST", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/fields", token=token, payload=payload)


def create_view(token: str, app_token: str, payload: dict) -> None:
    request("POST", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/views", token=token, payload=payload)


def update_view(token: str, app_token: str, view_id: str, payload: dict) -> None:
    request("PATCH", f"/bitable/v1/apps/{app_token}/tables/{TABLE_ID}/views/{view_id}", token=token, payload=payload)


def list_views_v3(token: str, app_token: str) -> list[dict]:
    views: list[dict] = []
    page_token = ""
    while True:
        params = {"page_size": 200}
        if page_token:
            params["page_token"] = page_token
        query = urllib.parse.urlencode(params)
        body = request("GET", f"/base/v3/bases/{app_token}/tables/{TABLE_ID}/views?{query}", token=token)
        data = body.get("data", {})
        views.extend(data.get("views") or data.get("items") or [])
        if not data.get("has_more"):
            break
        page_token = data["page_token"]
    return views


def create_view_v3(token: str, app_token: str, name: str, view_type: str) -> dict:
    body = request(
        "POST",
        f"/base/v3/bases/{app_token}/tables/{TABLE_ID}/views",
        token=token,
        payload={"name": name, "type": view_type},
    )
    return (body.get("data") or {}).get("view") or body.get("data") or {}


def rename_view_v3(token: str, app_token: str, view_id: str, name: str) -> None:
    request(
        "PATCH",
        f"/base/v3/bases/{app_token}/tables/{TABLE_ID}/views/{view_id}",
        token=token,
        payload={"name": name},
    )


def set_view_group_v3(token: str, app_token: str, view_id: str, field: str) -> None:
    request_view_config_v3(
        token,
        app_token,
        view_id,
        "group",
        {"group_config": [{"field": field, "desc": False}]},
    )


def set_view_filter_v3(token: str, app_token: str, view_id: str, conditions: list[list]) -> None:
    request_view_config_v3(
        token,
        app_token,
        view_id,
        "filter",
        {"logic": "and", "conditions": conditions},
    )


def set_view_visible_fields_v3(token: str, app_token: str, view_id: str, fields: list[str]) -> None:
    request_view_config_v3(
        token,
        app_token,
        view_id,
        "visible_fields",
        {"visible_fields": fields},
    )


def request_view_config_v3(token: str, app_token: str, view_id: str, resource: str, payload: dict) -> None:
    path = f"/base/v3/bases/{app_token}/tables/{TABLE_ID}/views/{view_id}/{resource}"
    for attempt in range(3):
        try:
            request("PUT", path, token=token, payload=payload)
            return
        except RuntimeError as exc:
            if "800070003" in str(exc):
                print(f"skipped {resource} for {view_id}: no operation produced")
                return
            if "800030501" not in str(exc) or attempt == 2:
                raise
            time.sleep(1)


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


def select_options_v3(field_name: str, options: list[str]) -> list[dict]:
    colors = SELECT_FIELD_OPTION_COLORS.get(field_name, {})
    return [{"name": name, **colors.get(name, {})} for name in options]


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

    ensure_select_option_colors(token, app_token)


def ensure_select_option_colors(token: str, app_token: str) -> None:
    fields = list_fields(token, app_token)
    by_name = {field["field_name"]: field for field in fields}
    for name in SELECT_FIELD_OPTION_COLORS:
        existing = find_field(by_name, name)
        if not existing:
            continue
        payload = {
            "name": name,
            "type": "select",
            "multiple": False,
            "options": select_options_v3(name, SELECT_FIELDS[name]),
        }
        body = update_field_v3(token, app_token, existing["field_id"], payload)
        if body.get("code") == 1254606:
            print(f"select field colors already current {name}")
        else:
            print(f"updated select field colors {name}")


def ensure_views(token: str, app_token: str) -> None:
    fields = list_fields(token, app_token)
    status_field = next((field for field in fields if field.get("field_name") == "状态"), None)
    owner_field = next((field for field in fields if field.get("field_name") == "负责人"), None)
    if not status_field or not owner_field:
        print("skipped board views: missing 状态 or 负责人 field")
        return

    views = list_views_v3(token, app_token)
    by_name = {view.get("name"): view for view in views}
    board_view = by_name.get(BOARD_VIEW_NAME)
    if not board_view:
        for legacy_name in LEGACY_BOARD_VIEW_NAMES:
            legacy_view = by_name.get(legacy_name)
            if legacy_view:
                rename_view_v3(token, app_token, legacy_view["id"], BOARD_VIEW_NAME)
                board_view = {**legacy_view, "name": BOARD_VIEW_NAME}
                print(f"renamed view {legacy_name} -> {BOARD_VIEW_NAME}")
                break
    if not board_view:
        board_view = create_view_v3(token, app_token, BOARD_VIEW_NAME, BOARD_VIEW_TYPE)
        if not board_view.get("id"):
            board_view = next((item for item in list_views_v3(token, app_token) if item.get("name") == BOARD_VIEW_NAME), {})
        print(f"created view {BOARD_VIEW_NAME}")
    else:
        print(f"view already exists: {BOARD_VIEW_NAME}")

    set_view_group_v3(token, app_token, board_view["id"], status_field["field_id"])
    set_view_filter_v3(token, app_token, board_view["id"], [])
    set_view_visible_fields_v3(token, app_token, board_view["id"], BOARD_VISIBLE_FIELDS)
    print(f"grouped {BOARD_VIEW_NAME} by 状态")

    views = list_views_v3(token, app_token)
    by_name = {view.get("name"): view for view in views}
    for role, view_name in ROLE_BOARD_VIEWS.items():
        role_view = by_name.get(view_name)
        if not role_view:
            role_view = create_view_v3(token, app_token, view_name, BOARD_VIEW_TYPE)
            if not role_view.get("id"):
                role_view = next((item for item in list_views_v3(token, app_token) if item.get("name") == view_name), {})
            print(f"created view {view_name}")
        else:
            print(f"view already exists: {view_name}")

        set_view_group_v3(token, app_token, role_view["id"], status_field["field_id"])
        set_view_filter_v3(token, app_token, role_view["id"], [[owner_field["field_id"], "intersects", [role]]])
        set_view_visible_fields_v3(token, app_token, role_view["id"], BOARD_VISIBLE_FIELDS)
        print(f"filtered {view_name} by 负责人={role}")


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
