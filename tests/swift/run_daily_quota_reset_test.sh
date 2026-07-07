#!/usr/bin/env bash
#
# run_daily_quota_reset_test.sh — 编译 + 运行 tests/swift/main.swift（WTJ-20260707-004）
#
# 见 tests/swift/main.swift 顶部注释：app/shell/main.swift 是顶层语句入口，不能被安全
# import，跨日判定的纯逻辑因此单独抽到 app/shell/DailyQuota.swift（纯声明、无顶层语句）。
# 本脚本只把这两个文件一起单独 swiftc 编译，不涉及 app/shell/main.swift/Cocoa/WebKit，
# 跑得快、不需要签名/app bundle，可反复执行。
#
# Run:  tests/swift/run_daily_quota_reset_test.sh
# Exit: 0 = 全部用例通过 · 非 0 = 有用例失败 / 编译失败
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TMP_BIN="$(mktemp -t wtj_daily_quota_reset_test)"

cleanup() {
  rm -f "$TMP_BIN"
}
trap cleanup EXIT

swiftc -swift-version 5 \
  "$REPO_ROOT/app/shell/DailyQuota.swift" \
  "$SCRIPT_DIR/main.swift" \
  -o "$TMP_BIN"

set +e
"$TMP_BIN"
STATUS=$?
set -e

exit "$STATUS"
